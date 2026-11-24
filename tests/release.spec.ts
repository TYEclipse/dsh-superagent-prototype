import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Runs the real release script against a throwaway git repository and a local bare remote, so no
 * GitHub state is read or written. The release creation is the one step the test skips.
 */
const ROOT = join(import.meta.dirname, '..')
const identity = ['-c', 'user.name=release-test', '-c', 'user.email=release-test@example.com']
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'release-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const posix = (path: string): string => path.split('\\').join('/')
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', [...identity, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** A work repository on `main` and a bare `origin`, one commit apart from the version in package.json. */
function repository(): { work: string; remote: string } {
  const work = join(dir, 'work')
  const remote = join(dir, 'origin.git')
  mkdirSync(work)
  execFileSync('git', ['init', '--bare', '-q', remote], { cwd: dir })
  git(work, 'init', '-q')
  git(work, 'checkout', '-q', '-b', 'main')
  writeFileSync(join(work, 'package.json'), `${JSON.stringify({ name: 'dsh-superagent', version: '0.2.0' }, null, 2)}\n`)
  git(work, 'add', 'package.json')
  git(work, 'commit', '-q', '-m', 'init')
  git(work, 'remote', 'add', 'origin', posix(remote))
  git(work, 'push', '-q', '-u', 'origin', 'main')
  return { work, remote }
}

const versionOf = (work: string): string => JSON.parse(readFileSync(join(work, 'package.json'), 'utf8')).version
const remoteTags = (remote: string): string[] => {
  const listed = git(remote, 'tag', '--list')
  return listed ? listed.split('\n') : []
}

const release = (...args: string[]): { status: number; output: string } => {
  // The script only releases GITHUB_SHA when that CI variable is set, so the throwaway repository
  // must not inherit the runner's value.
  const env = { ...process.env }
  delete env.GITHUB_SHA
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  try {
    return { status: 0, output: execFileSync(process.execPath, [join(ROOT, 'scripts', 'release.mjs'), ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { status: failure.status ?? 1, output: `${String(failure.stdout ?? '')}${String(failure.stderr ?? '')}` }
  }
}

describe('release script', () => {
  it('prints the next patch version without changing the checkout', () => {
    const { work } = repository()
    const result = release('--repo', work, '--dry-run')
    expect(result.status).toBe(0)
    expect(result.output).toContain('Would release v0.2.1 (current version 0.2.0)')
    expect(versionOf(work)).toBe('0.2.0')
    expect(git(work, 'log', '--format=%s').split('\n')).toEqual(['init'])
    expect(git(work, 'tag', '--list')).toBe('')
  }, 30_000)

  it('commits, tags and pushes the bump, and the next update bumps again', () => {
    const { work, remote } = repository()
    const first = release('--repo', work, '--skip-release')
    expect(first.status).toBe(0)
    expect(first.output).toContain('Tagged v0.2.1')
    expect(versionOf(work)).toBe('0.2.1')
    expect(git(work, 'log', '-1', '--format=%s')).toBe('chore(release): v0.2.1')
    expect(git(remote, 'log', '-1', '--format=%s', 'main')).toBe('chore(release): v0.2.1')
    expect(remoteTags(remote)).toEqual(['v0.2.1'])

    const second = release('--repo', work, '--skip-release')
    expect(second.status).toBe(0)
    expect(second.output).toContain('Tagged v0.2.2')
    expect(versionOf(work)).toBe('0.2.2')
    expect(remoteTags(remote)).toEqual(['v0.2.1', 'v0.2.2'])
  }, 30_000)

  it('leaves the update to the newer run when main has moved past the checkout', () => {
    const { work, remote } = repository()
    writeFileSync(join(work, 'package.json'), `${JSON.stringify({ name: 'dsh-superagent', version: '0.2.1' }, null, 2)}\n`)
    git(work, 'commit', '-q', '-am', 'next')
    git(work, 'push', '-q', 'origin', 'main')
    git(work, 'checkout', '-q', '--detach', 'HEAD~1')

    const result = release('--repo', work, '--skip-release')
    expect(result.status).toBe(0)
    expect(result.output).toContain('the newer run releases it')
    expect(versionOf(work)).toBe('0.2.0')
    expect(remoteTags(remote)).toEqual([])
  }, 30_000)

  it('refuses to release a dirty checkout', () => {
    const { work } = repository()
    writeFileSync(join(work, 'notes.txt'), 'local change\n')
    const result = release('--repo', work, '--skip-release')
    expect(result.status).toBe(1)
    expect(result.output).toContain('The checkout is not clean')
    expect(versionOf(work)).toBe('0.2.0')
  }, 30_000)
})
