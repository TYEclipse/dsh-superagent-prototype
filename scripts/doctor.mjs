#!/usr/bin/env node
/**
 * Pre-flight checks for a dsh-superagent installation.
 *
 * In the spirit of `hermes doctor`, checks are ordered named functions that print one row each and merge into a
 * report; the process exits non-zero when an issue remains. Static checks come first and the optional panel probe
 * last, so a broken installation reports its local cause before its network symptom.
 *
 * Usage:
 *   node scripts/doctor.mjs [--repo <checkout>] [--dsh <path to @deepseek-ai/dsh/lib/bin.js>]
 *                           [--profile <name>] [--url <panel url>] [--json] [--fix]
 * Exit code: 0 when every check passed, 1 otherwise.
 */
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const options = parse(process.argv.slice(2))
const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok, ...detail === undefined ? {} : { detail } }); return ok }
const ok = (name, detail) => check(name, true, detail)
const fail = (name, detail) => check(name, false, detail)
const warn = name => ok(name, 'unknown (not checked)')

function parse(argv) {
  const parsed = { repo: resolve(dirname(fileURLToPath(import.meta.url)), '..'), dsh: undefined, profile: undefined, url: undefined, json: false, fix: false }
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]
    if (name === '--json') { parsed.json = true; continue }
    if (name === '--fix') { parsed.fix = true; continue }
    const value = argv[index + 1]
    if (name === '--repo') { parsed.repo = resolve(value); index++ }
    else if (name === '--dsh') { parsed.dsh = resolve(value); index++ }
    else if (name === '--profile') { parsed.profile = value; index++ }
    else if (name === '--url') { parsed.url = value; index++ }
    else throw new Error(`Unknown argument: ${name}`)
  }
  return parsed
}
const read = path => readFileSync(path, 'utf8')
const packageJson = (dir = options.repo) => JSON.parse(read(join(dir, 'package.json')))
const versionTuple = text => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(text).trim())
  if (!match) return undefined
  const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const pre = match[4]
  return { major, minor, patch, pre }
}
const atLeast = (current, base) => {
  if (!current || !base) return false
  for (const key of ['major', 'minor', 'patch']) if (current[key] !== base[key]) return current[key] > base[key]
  if (!current.pre) return true
  if (!base.pre) return false
  const left = current.pre.split('.'), right = base.pre.split('.')
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    if (left[index] === undefined) return false
    if (right[index] === undefined) return true
    if (left[index] === right[index]) continue
    const leftNumber = /^\d+$/.test(left[index]), rightNumber = /^\d+$/.test(right[index])
    if (leftNumber && rightNumber) return Number(left[index]) > Number(right[index])
    if (leftNumber !== rightNumber) return leftNumber
    return left[index] > right[index]
  }
  return true
}
const satisfies = (version, range) => {
  const current = versionTuple(version)
  if (!current) return false
  for (const part of range.split('||').map(item => item.trim()).filter(Boolean)) {
    const caret = /^\^([^\s]+)$/.exec(part), atLeastRange = /^>=([^\s]+)$/.exec(part)
    if (caret) {
      const base = versionTuple(caret[1])
      if (base && atLeast(current, base) && current.major === base.major && current.minor === base.minor) return true
    } else if (atLeastRange) {
      const base = versionTuple(atLeastRange[1])
      if (base && atLeast(current, base)) return true
    } else if (versionTuple(part)?.major === current.major && versionTuple(part)?.minor === current.minor && versionTuple(part)?.patch === current.patch) return true
  }
  return false
}
const run = (program, args, cwd = options.repo) => execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

// 1. Node.js version.
try {
  const engines = packageJson().engines?.node ?? ''
  const current = process.versions.node
  const passes = engines.split('||').some(part => satisfies(current, part.trim()))
  check('node', passes, `${current} ${engines ? `against ${engines}` : '(no engines.node declared)'}`)
} catch (error) { fail('node', `cannot read package.json: ${error.message}`) }

// 2. The DeepSeek Harness CLI, when the operator points at one.
if (options.dsh) {
  try {
    const version = run(process.execPath, [options.dsh, '--version'])
    const engines = packageJson().engines?.dsh ?? '^0.2.2-rc.1'
    check('dsh', satisfies(version, engines), `${version} against ${engines}`)
  } catch (error) { fail('dsh', `cannot run ${options.dsh}: ${error.message}`) }
} else warn('dsh')

// 3. The bundle was built.
const built = ['lib/index.js', 'lib/client.js'].filter(file => existsSync(join(options.repo, file)))
check('bundle', built.length === 2, built.length === 2 ? 'lib/index.js and lib/client.js' : `missing ${['lib/index.js', 'lib/client.js'].filter(file => !built.includes(file)).join(', ')}; run pnpm build`)

// 4. Where this checkout is (informational; a tarball checkout has no git).
try {
  const commit = run('git', ['rev-parse', '--short', 'HEAD'])
  const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const dirty = run('git', ['status', '--porcelain']) !== ''
  ok('git', `${branch} @ ${commit}${dirty ? ' (modified)' : ''}`)
} catch { ok('git', 'not a git checkout') }

// 5. The DSH profile, when one is named: it exists, links this checkout, and has machine configuration.
let stateDir
if (options.profile) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(home, 'profiles', options.profile)
  if (!existsSync(dir)) fail('profile', `${dir} does not exist`)
  else {
    let linked = false
    try {
      const profile = JSON.parse(read(join(dir, 'package.json')))
      const spec = String(profile.dependencies?.['dsh-superagent'] ?? '')
      linked = spec.startsWith('link:') && resolve(spec.slice('link:'.length)) === resolve(options.repo)
    } catch { /* Reported below. */ }
    check('profile', linked, linked ? `${options.profile} links this checkout` : `${options.profile} does not link ${options.repo}`)
    const patch = join(dir, 'cordis.patch.yml')
    if (!existsSync(patch)) fail('profile config', `${patch} does not exist`)
    else {
      const text = read(patch)
      stateDir = /stateDir:\s*(\S+)/.exec(text)?.[1]?.replace(/^['"]|['"]$/g, '')
      check('profile config', !!stateDir, stateDir ?? 'cordis.patch.yml names no stateDir')
    }
  }
} else warn('profile')

// 6. The state directory exists and is writable; --fix creates it.
if (stateDir) {
  const dir = resolve(stateDir.replace(/^~(?=$|[\\/])/, homedir()))
  let exists = existsSync(dir)
  if (!exists && options.fix) { try { mkdirSync(dir, { recursive: true }); exists = true } catch { /* Reported below. */ } }
  let writable = false
  if (exists) { try { accessSync(dir, constants.W_OK); writable = statSync(dir).isDirectory() } catch { /* Reported below. */ } }
  check('state', exists && writable, !exists ? `${dir} does not exist${options.fix ? ' and could not be created' : '; run with --fix'}` : `${dir} is writable`)
} else warn('state')

// 7. A running panel, last, when a URL is given.
if (options.url) {
  const url = `${options.url.replace(/\/$/, '')}/orchestrator/api/state`
  try {
    const response = await fetch(url, { headers: { 'x-orchestrator-request': '1' }, signal: AbortSignal.timeout(10_000) })
    const body = response.status === 200 ? await response.json() : undefined
    check('panel', response.status === 200, body ? `HTTP 200; setup ${body.setup?.problem?.code ?? 'configured'}, runtime ${body.health?.runtime?.state ?? 'unknown'}` : `HTTP ${response.status}`)
  } catch (error) { fail('panel', `${url}: ${error.message}`) }
} else warn('panel')

const report = { schemaVersion: 1, at: new Date().toISOString(), repo: options.repo, profile: options.profile, checks, ok: checks.every(item => item.ok) }
if (options.json) console.log(JSON.stringify(report, null, 2))
else {
  for (const item of checks) console.log(`${item.ok ? 'ok  ' : 'FAIL'} ${item.name}${item.detail ? `: ${item.detail}` : ''}`)
  console.log(report.ok ? 'All checks passed.' : 'Some checks failed; fix them in the order shown.')
}
process.exit(report.ok ? 0 : 1)
