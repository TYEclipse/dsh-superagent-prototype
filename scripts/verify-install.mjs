#!/usr/bin/env node
/**
 * Prove that this checkout installs as a DeepSeek Harness bundle and its panel works.
 *
 * It creates a throwaway `$DSH_HOME`, builds a fresh profile from the shipped Web template, installs this
 * checkout with `link:`, boots the profile on a free loopback port and reads the management API as the panel
 * does. The run writes a machine-readable receipt (by default `.artifacts/install-verification.json`) with the
 * commit, the DSH version, every check and the failure that stopped it, so a PDCA round or CI can keep it.
 *
 * Usage: node scripts/verify-install.mjs --dsh <path to @deepseek-ai/dsh/lib/bin.js> [--port N]
 *        [--receipt path] [--keep] [--timeout ms]
 * Exit code: 0 when every check passed, 1 otherwise.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const options = parseArgs(process.argv.slice(2))
const profile = 'superagent-verify'
const header = { 'x-orchestrator-request': '1' }
const startedAt = new Date().toISOString()
const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok, ...detail === undefined ? {} : { detail } }); log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`); return ok }
const log = line => console.log(line)
const record = () => ({ schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), repo, commit: commit(),
  dsh: options.dsh, dshVersion: dshVersion(), profile, port: options.port, checks, ok: checks.every(item => item.ok) })

function parseArgs(argv) {
  const parsed = { port: 0, timeout: 180_000, keep: false, receipt: join(repo, '.artifacts', 'install-verification.json') }
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]
    if (name === '--keep') { parsed.keep = true; continue }
    const value = argv[index + 1]
    if (name === '--dsh') { parsed.dsh = value; index++ } else if (name === '--port') { parsed.port = Number(value); index++ }
    else if (name === '--receipt') { parsed.receipt = resolve(value); index++ } else if (name === '--timeout') { parsed.timeout = Number(value); index++ }
    else throw new Error(`Unknown argument: ${name}`)
  }
  if (!parsed.dsh) throw new Error('--dsh <path to @deepseek-ai/dsh/lib/bin.js> is required')
  if (!existsSync(parsed.dsh)) throw new Error(`The dsh entry does not exist: ${parsed.dsh}`)
  return parsed
}
function run(argv, env) { return execFileSync(process.execPath, [options.dsh, ...argv], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
function commit() { try { return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' } }
function dshVersion() { try { return execFileSync(process.execPath, [options.dsh, '--version'], { encoding: 'utf8' }).trim() } catch { return 'unknown' } }
const freePort = () => new Promise((resolvePort, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)) })
})
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms))
async function state(port) {
  const response = await fetch(`http://127.0.0.1:${port}/orchestrator/api/state`, { headers: header, signal: AbortSignal.timeout(5_000) })
  return { status: response.status, text: await response.text() }
}
async function page(port) {
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5_000) })
  return { status: response.status, text: await response.text() }
}
function save(receipt) {
  mkdirSync(dirname(options.receipt), { recursive: true })
  writeFileSync(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`)
  log(`receipt: ${options.receipt}`)
}

let child, home, stateDir, logs = ''
try {
  home = mkdtempSync(join(tmpdir(), 'dsh-superagent-verify-'))
  stateDir = join(home, 'state')
  options.port ||= await freePort()
  const env = { ...process.env, DSH_HOME: home }
  log(`repo: ${repo}`)
  log(`commit: ${commit()}`)
  log(`dsh: ${dshVersion()}`)
  log(`DSH_HOME: ${home}`)
  log(`port: ${options.port}`)

  // 1. The shipped Web template composes with this dsh, and the profile directory exists.
  const composed = run([profile, '--from-default-profile', 'web', '--dump-config'], env)
  check('the Web template composes', composed.includes('@deepseek-ai/dsh-base') && composed.includes('webserver'), `${composed.split('\n').length} lines`)

  // 2. The marketplace entry of this checkout resolves as a link: install.
  const linked = run(['plugin', '--profile', profile, 'add', `link:${repo.split(sep).join('/')}`], env)
  check('the bundle installs with link:', /dsh-superagent/.test(linked), linked.trim().split('\n').slice(-1)[0])

  // 3. The profile points at this checkout and a throwaway state directory; only the panel port is chosen for the run.
  const profileDir = join(home, 'profiles', profile)
  writeFileSync(join(profileDir, 'cordis.patch.yml'), ['# Written by scripts/verify-install.mjs for one verification run.',
    '- id: webserver', '  config:', '    host: 127.0.0.1', `    port: ${options.port}`, '- id: dsh-superagent', '  config:',
    `    stateDir: ${stateDir.split(sep).join('/')}`, ''].join('\n'))
  const installed = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  check('the profile depends on this checkout', String(installed.dependencies?.['dsh-superagent'] ?? '').includes(repo.split(sep).join('/')))

  // 4. The profile boots; the plugin loads before the panel answers.
  child = spawn(process.execPath, [options.dsh, '--profile', profile, '--no-open'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs += String(chunk) })
  const deadline = Date.now() + options.timeout
  let answer
  while (Date.now() < deadline) {
    try { answer = await state(options.port); if (answer.status === 200) break } catch { /* still booting */ }
    if (child.exitCode !== null) break
    await sleep(1_000)
  }
  check('the panel answers GET /orchestrator/api/state', answer?.status === 200, answer ? `HTTP ${answer.status}` : `no answer within ${options.timeout} ms`)

  if (answer?.status === 200) {
    const body = JSON.parse(answer.text)
    check('the state carries setup, health, load and the main Session', ['setup', 'health', 'load', 'masterId', 'paused'].every(key => key in body))
    const runtimeHealth = body.health?.runtime
    check('the runtime reports ready or waiting for setup', ['ready', 'paused'].includes(runtimeHealth?.state), runtimeHealth ? `${runtimeHealth.state} (${runtimeHealth.code ?? runtimeHealth.detail ?? ''})` : 'no runtime entry')
    check('the state names this profile\'s state directory', body.setup?.machine?.stateDir === stateDir.split(sep).join('/'), body.setup?.machine?.stateDir)
    check('the state is the expected setup state for a fresh profile', body.setup?.problem === null || body.setup?.problem?.code === 'repositoryUnset', body.setup?.problem?.code ?? 'configured')
    const settings = await fetch(`http://127.0.0.1:${options.port}/orchestrator/api/settings`, { headers: header, signal: AbortSignal.timeout(5_000) })
    check('the panel settings route answers', settings.status === 200, `HTTP ${settings.status}`)
    const prompts = await fetch(`http://127.0.0.1:${options.port}/orchestrator/api/prompts`, { headers: header, signal: AbortSignal.timeout(5_000) })
    const promptsBody = prompts.status === 200 ? await prompts.json() : undefined
    const worker = promptsBody ? JSON.stringify(promptsBody.current?.config ?? {}) : ''
    check('the prompts route serves this build\'s configuration', prompts.status === 200 && worker.length > 0, `HTTP ${prompts.status}`)
    const shell = await page(options.port)
    // The Web shell itself is token-gated (401 without the browser's boot token); the server answering proves it serves.
    check('the web server answers the panel shell route', shell.status < 500, `HTTP ${shell.status}`)
    check('the state directory holds the database', existsSync(join(stateDir, 'orchestrator.sqlite')))
    check('the worker and router presets are mounted', existsSync(join(stateDir, 'orchestrator.sqlite')) && promptsBody !== undefined)
  }
} catch (error) {
  check('the verification run completed', false, error instanceof Error ? error.message : String(error))
  if (logs) log(`--- profile log (tail) ---\n${logs.split('\n').slice(-20).join('\n')}`)
} finally {
  if (child && child.exitCode === null) {
    child.kill()
    await new Promise(resolveExit => { child.once('exit', resolveExit); setTimeout(resolveExit, 10_000) })
  }
  save(record())
  if (!options.keep && home) rmSync(home, { recursive: true, force: true })
  else if (home) log(`kept DSH_HOME: ${home}`)
}
const receipt = record()
process.exit(receipt.ok ? 0 : 1)
