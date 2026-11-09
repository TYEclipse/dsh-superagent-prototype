import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
const doctor = (...args: string[]): { status: number; output: string } => {
  try { return { status: 0, output: execFileSync(process.execPath, [join(ROOT, 'scripts', 'doctor.mjs'), ...args], { encoding: 'utf8' }) } }
  catch (error) { const failure = error as { status?: number; stdout?: string }; return { status: failure.status ?? 1, output: String(failure.stdout ?? '') } }
}
const report = (output: string) => JSON.parse(output) as { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] }

describe('doctor', () => {
  it('passes on a built checkout with a matching dsh, and reports every check', () => {
    const result = doctor('--repo', fakeRepo(), '--dsh', fakeDsh('0.2.2-rc.1'), '--json')
    expect(result.status).toBe(0)
    const parsed = report(result.output)
    expect(parsed.ok).toBe(true)
    expect(parsed.checks.map(item => item.name)).toEqual(['node', 'dsh', 'bundle', 'git', 'profile', 'state', 'panel'])
    expect(parsed.checks.find(item => item.name === 'dsh')!.ok).toBe(true)
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
})
