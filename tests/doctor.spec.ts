import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/** Runs the real doctor script against a throwaway repository and a fake dsh CLI, so no host state is read. */
const ROOT = join(import.meta.dirname, '..')
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'doctor-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
const fakeDsh = (version: string): string => { const file = join(dir, 'dsh.mjs'); writeFileSync(file, `console.log(${JSON.stringify(version)})\n`); return file }
const fakeRepo = (target = dir, files = ['index.js', 'client.js']): string => {
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(target, 'package.json'), JSON.stringify({ engines: { node: '>=22.19.0', dsh: '^0.2.2-rc.1' } }))
  for (const file of files) writeFileSync(join(target, 'lib', file), '')
  return target
}
const source = (repo: string): string => { mkdirSync(join(repo, 'src'), { recursive: true }); const file = join(repo, 'src', 'index.ts'); writeFileSync(file, ''); return file }
const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000)
const touched = (file: string, time: Date): void => utimesSync(file, time, time)
const doctor = (...args: string[]): { status: number; output: string } => {
  try { return { status: 0, output: execFileSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs'), ...args], { encoding: 'utf8' }) } }
  catch (error) { const failure = error as { status?: number; stdout?: string }; return { status: failure.status ?? 1, output: String(failure.stdout ?? '') } }
}
const report = (output: string) => JSON.parse(output) as { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] }
const checkNamed = (output: string, name: string) => report(output).checks.find(item => item.name === name)

describe('doctor', () => {
  it('passes on a built checkout with a matching dsh, and reports every check', () => {
    const result = doctor('--repo', fakeRepo(), '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(result.status).toBe(0)
    const parsed = report(result.output)
    expect(parsed.ok).toBe(true)
    expect(parsed.checks.map(item => item.name)).toEqual(['node', 'dsh', 'bundle', 'build', 'git', 'profile', 'state', 'panel'])
    expect(parsed.checks.find(item => item.name === 'dsh')!.ok).toBe(true)
    expect(checkNamed(result.output, 'build')).toMatchObject({ ok: true, detail: expect.stringContaining('skip') })
  })

  it('fails when the dsh CLI is outside the engine range, or the bundle was not built', () => {
    const mismatch = doctor('--repo', fakeRepo(), '--dsh', fakeDsh('0.1.0'), '--json')
    expect(mismatch.status).toBe(1)
    expect(report(mismatch.output).checks.find(item => item.name === 'dsh')).toMatchObject({ ok: false })
    const unbuilt = doctor('--repo', fakeRepo(join(dir, 'unbuilt'), ['index.js']), '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(unbuilt.status).toBe(1)
    expect(report(unbuilt.output).checks.find(item => item.name === 'bundle')).toMatchObject({ ok: false, detail: expect.stringContaining('client.js') })
  })

  it('checks a named profile and its state directory, and --fix creates a missing one', () => {
    const home = join(dir, 'home'), repo = join(dir, 'repo'), profile = join(home, 'profiles', 'superagent')
    mkdirSync(profile, { recursive: true }); fakeRepo(repo)
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-superagent': `link:${repo.split('\\').join('/')}` } }))
    writeFileSync(join(profile, 'cordis.patch.yml'), `- id: dsh-superagent\n  config:\n    stateDir: ${join(dir, 'state')}\n`)
    const env = { ...process.env, DSH_HOME: home }
    const run = (...args: string[]) => {
      try { return { status: 0, output: execFileSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs'), '--repo', repo, ...args], { encoding: 'utf8', env }) } }
      catch (error) { const failure = error as { status?: number; stdout?: string }; return { status: failure.status ?? 1, output: String(failure.stdout ?? '') } }
    }
    const missing = run('--profile', 'superagent', '--json')
    expect(missing.status).toBe(1)
    expect(report(missing.output).checks.find(item => item.name === 'state')).toMatchObject({ ok: false })
    expect(run('--profile', 'superagent', '--fix', '--json').status).toBe(0)
  })

  it('fails when an artefact is older than the source, and passes when every artefact is fresh', () => {
    const stale = fakeRepo(join(dir, 'stale'), ['index.js', 'client.js', 'github-watch.js', 'feishu-watch.js'])
    const staleSource = source(stale)
    for (const file of ['index.js', 'github-watch.js', 'feishu-watch.js']) touched(join(stale, 'lib', file), hoursAgo(2))
    touched(join(stale, 'lib', 'client.js'), hoursAgo(4))
    touched(staleSource, hoursAgo(1))
    const staleResult = doctor('--repo', stale, '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(staleResult.status).toBe(1)
    const staleBuild = checkNamed(staleResult.output, 'build')
    expect(staleBuild).toMatchObject({ ok: false, detail: expect.stringContaining('pnpm build') })
    expect(staleBuild!.detail).toContain('src/index.ts')
    expect(staleBuild!.detail).toContain('lib/client.js')

    const fresh = fakeRepo(join(dir, 'fresh'), ['index.js', 'client.js', 'github-watch.js', 'feishu-watch.js'])
    const freshSource = source(fresh)
    touched(freshSource, hoursAgo(4))
    for (const file of ['index.js', 'client.js', 'github-watch.js', 'feishu-watch.js']) touched(join(fresh, 'lib', file), hoursAgo(1))
    const freshResult = doctor('--repo', fresh, '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(freshResult.status).toBe(0)
    expect(checkNamed(freshResult.output, 'build')).toMatchObject({ ok: true })
  })

  it('skips the build check when the checkout has no source tree (a tarball install)', () => {
    const tarball = fakeRepo(join(dir, 'tarball'))
    const result = doctor('--repo', tarball, '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(result.status).toBe(0)
    expect(checkNamed(result.output, 'build')).toMatchObject({ ok: true, detail: expect.stringContaining('skip') })
  })

  it('warns, without failing, when the install-verification receipt names another commit', () => {
    const repo = join(dir, 'receipt')
    fakeRepo(repo)
    const git = (...args: string[]): string => execFileSync('git', ['-c', 'user.name=doctor', '-c', 'user.email=doctor@example.com',
      '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    git('init', '-q')
    git('commit', '-q', '--allow-empty', '-m', 'init')
    const head = git('rev-parse', 'HEAD')
    const recorded = '0123456789abcdef0123456789abcdef01234567'
    mkdirSync(join(repo, '.artifacts'), { recursive: true })
    writeFileSync(join(repo, '.artifacts', 'install-verification.json'), JSON.stringify({ schemaVersion: 1, commit: recorded }))
    const result = doctor('--repo', repo, '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(result.status).toBe(0)
    const warning = checkNamed(result.output, 'receipt')
    expect(warning).toMatchObject({ ok: true, detail: expect.stringContaining(recorded) })
    expect(warning!.detail).toContain(head)
  })
})
