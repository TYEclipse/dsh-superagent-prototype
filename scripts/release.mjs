#!/usr/bin/env node
/**
 * Bump the patch version, commit and tag it, and publish a GitHub release.
 *
 * The release job in `.github/workflows/ci.yml` runs this after `pnpm check` passes for a push to
 * `main`. It releases only the commit CI checked out: when `main` has moved on by the time the job
 * starts, it exits without changing anything and the newer run publishes the newer state. The patch
 * is bumped from the version in `package.json`, so every update to `main` gets its own version.
 *
 * `--dry-run` prints the version it would publish and touches nothing. `--skip-release` stops after
 * the pushed tag instead of creating the GitHub release, which is what the test uses.
 *
 * Usage:
 *   node scripts/release.mjs [--repo <checkout>] [--remote origin] [--branch main]
 *                            [--dry-run] [--skip-release]
 * Exit code: 0 when it released (or a newer run owns the update), 1 on a failure.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const ATTEMPTS = 3

const options = parse(process.argv.slice(2))
const repo = resolve(options.repo)
const remote = options.remote
const branch = options.branch

release().catch(error => {
  const detail = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : ''
  console.error(detail || (error instanceof Error ? error.message : String(error)))
  process.exit(1)
})

async function release() {
  if (options.dryRun) {
    const planned = plan()
    console.log(`Would release ${planned.tag} (current version ${planned.current}); no changes made.`)
    return
  }

  requireClean()
  fetchMain()
  const head = git(['rev-parse', 'HEAD'])
  const main = git(['rev-parse', `${remote}/${branch}`])
  if (head !== main) {
    console.log(`${branch} moved to ${short(main)} after this run was checked out (${short(head)}); the newer run releases it.`)
    return
  }
  const checked = process.env.GITHUB_SHA
  if (checked && head !== checked) {
    console.log(`The checkout is ${short(head)}, not the commit this run checked (${short(checked)}); the newer run releases it.`)
    return
  }

  const planned = plan()
  applyVersion(planned.next)
  commitAndTag(planned)
  try {
    git(['push', '--atomic', remote, `HEAD:${branch}`, `refs/tags/${planned.tag}`])
  } catch (error) {
    // A push rejected as non-fast-forward means another update landed after the checks ran; that
    // run publishes the newer state. Anything else (auth, network) is a real failure.
    fetchMain()
    if (git(['rev-parse', `${remote}/${branch}`]) !== head) {
      console.log(`${branch} moved while the release was pushed; the newer run releases it.`)
      return
    }
    throw error
  }

  if (options.skipRelease) {
    console.log(`Tagged ${planned.tag} and pushed it; release creation skipped.`)
    return
  }
  const url = await createRelease(planned.tag)
  console.log(`Released ${planned.tag}: ${url}`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Released ${planned.tag}\n\n${url}\n`)
  }
}

function requireClean() {
  const status = git(['status', '--porcelain'])
  if (status) throw new Error(`The checkout is not clean, so it cannot be released:\n${status}`)
}

function fetchMain() {
  git(['fetch', '--tags', '--force', remote, branch])
}

function plan() {
  const packagePath = join(repo, 'package.json')
  const current = String(JSON.parse(readFileSync(packagePath, 'utf8')).version)
  const tags = new Set(git(['tag', '--list', 'v*']).split('\n').filter(Boolean))
  let next = bump(current)
  // A tag left by an earlier attempt is not reused: the version must be new for every update.
  for (let guard = 0; tags.has(`v${next}`); guard++) {
    if (guard > 1000) throw new Error(`No free patch version after v${current}.`)
    next = bump(next)
  }
  return { current, next, tag: `v${next}` }
}

function bump(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`The package version "${version}" is not a plain x.y.z release version.`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function applyVersion(next) {
  const packagePath = join(repo, 'package.json')
  const text = readFileSync(packagePath, 'utf8')
  // Replace only the top-level version line, preserving the file's own formatting.
  const updated = text.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${next}$2`)
  if (updated === text) throw new Error('package.json has no top-level version field to bump.')
  if (JSON.parse(updated).version !== next) throw new Error('package.json did not take the new version.')
  writeFileSync(packagePath, updated)
}

function commitAndTag({ tag }) {
  const identity = ['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, '-c', 'commit.gpgsign=false']
  git([...identity, 'add', 'package.json'])
  git([...identity, 'commit', '-m', `chore(release): ${tag}`])
  git([...identity, 'tag', '-a', tag, '-m', tag])
}

async function createRelease(tag) {
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    throw new Error('Neither GH_TOKEN nor GITHUB_TOKEN is set, so no release can be created.')
  }
  let failure
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const output = execFileSync('gh', ['release', 'create', tag, '--title', tag, '--generate-notes'], {
        cwd: repo,
        encoding: 'utf8',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
      const lines = output.split('\n').filter(Boolean)
      return lines.at(-1) ?? `https://github.com/${process.env.GITHUB_REPOSITORY ?? ''}/releases/tag/${tag}`
    } catch (error) {
      failure = error
      if (attempt < ATTEMPTS) await sleep(3000 * attempt)
    }
  }
  throw failure
}

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function short(revision) {
  return revision.slice(0, 12)
}

function parse(argv) {
  const parsed = { repo: process.cwd(), remote: 'origin', branch: 'main', dryRun: false, skipRelease: false }
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]
    if (name === '--dry-run') { parsed.dryRun = true; continue }
    if (name === '--skip-release') { parsed.skipRelease = true; continue }
    if (name === '--help' || name === '-h') { console.log('Usage: node scripts/release.mjs [--repo <checkout>] [--remote origin] [--branch main] [--dry-run] [--skip-release]'); process.exit(0) }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} expects a value.`)
    index++
    if (name === '--repo') parsed.repo = value
    else if (name === '--remote') parsed.remote = value
    else if (name === '--branch') parsed.branch = value
    else throw new Error(`Unknown argument: ${name}`)
  }
  return parsed
}
