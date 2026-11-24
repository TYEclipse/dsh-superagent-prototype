#!/usr/bin/env node
/**
 * Hold this platform's coverage at the high-water mark recorded in `coverage-baseline.json`.
 *
 * `pnpm check` runs this after `pnpm test:coverage`. The vitest thresholds are a fixed floor; this
 * ratchet makes the floor follow the measured coverage, so a later round cannot quietly spend the
 * margin between the two. The baseline is per platform because the POSIX-only suites skip on
 * Windows, so the two platforms measure different code.
 *
 * `--update` records the current numbers but only raises a metric. A metric may fall below its
 * mark by at most `--tolerance` (default 0.10 points) to absorb floating-point noise. Lowering a
 * mark needs `--update --allow-decrease`, and the round's record must say why.
 *
 * A platform without a baseline passes with a note the first time; `--update` records it. A missing
 * baseline file is a configuration error, not a reason to skip the gate.
 *
 * Usage:
 *   node scripts/coverage-ratchet.mjs [--summary <path>] [--baseline <path>] [--platform <key>]
 *        [--tolerance <points>] [--update [--allow-decrease]] [--json]
 * Exit code: 0 when the ratchet holds (or the baseline was updated), 1 otherwise.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const METRICS = ['statements', 'branches', 'functions', 'lines']
const DEFAULTS = {
  summary: resolve(ROOT, 'coverage', 'coverage-summary.json'),
  baseline: resolve(ROOT, 'coverage-baseline.json'),
  tolerance: 0.1,
}
const round = value => Math.round(value * 100) / 100
const format = value => value.toFixed(2)

const options = parse(process.argv.slice(2))
if (options.help) {
  console.log('Usage: node scripts/coverage-ratchet.mjs [--summary <path>] [--baseline <path>] [--platform <key>] [--tolerance <points>] [--update [--allow-decrease]] [--json]')
  process.exit(0)
}
try {
  run()
} catch (error) {
  console.error(`coverage ratchet: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

function parse(argv) {
  const parsed = { ...DEFAULTS, platform: `${process.platform}-${process.arch}`, update: false, allowDecrease: false, json: false, help: false }
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index]
    if (name === '--update') { parsed.update = true; continue }
    if (name === '--allow-decrease') { parsed.allowDecrease = true; continue }
    if (name === '--json') { parsed.json = true; continue }
    if (name === '--help' || name === '-h') { parsed.help = true; continue }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${name} expects a value.`)
    index++
    if (name === '--summary') parsed.summary = resolve(value)
    else if (name === '--baseline') parsed.baseline = resolve(value)
    else if (name === '--platform') parsed.platform = value
    else if (name === '--tolerance') parsed.tolerance = Number(value)
    else throw new Error(`Unknown argument: ${name}`)
  }
  if (!Number.isFinite(parsed.tolerance) || parsed.tolerance < 0) throw new Error('--tolerance must be a non-negative number.')
  if (parsed.allowDecrease && !parsed.update) throw new Error('--allow-decrease is only valid with --update.')
  return parsed
}

function run() {
  const current = readSummary(options.summary)
  const baseline = readBaseline(options.baseline)
  const recorded = baseline.platforms[options.platform]
  if (!recorded) {
    if (!options.update) {
      report({ ok: true, platform: options.platform, current, recorded: undefined, rows: [], note: 'no baseline for this platform yet; run --update on it' })
      return
    }
    writeBaseline(baseline, current)
    return
  }
  const result = compare(current, recorded)
  if (result.ok) {
    if (options.update) writeBaseline(baseline, current, recorded)
    else report({ ok: true, platform: options.platform, current, recorded, rows: result.rows })
    return
  }
  if (!options.update) {
    report({ ok: false, platform: options.platform, current, recorded, rows: result.rows })
    throw new Error(`coverage regressed on ${options.platform}; add tests, or record a deliberate decrease with --update --allow-decrease and say why in docs/evolution/round-<n>.md`)
  }
  if (!options.allowDecrease) {
    const below = result.rows.filter(row => row.below).map(row => `${row.metric} ${format(row.current)} < ${format(row.floor)}`).join(', ')
    throw new Error(`refusing to lower the mark on ${options.platform} (${below}); use --allow-decrease only for a deliberate decrease and record why`)
  }
  writeBaseline(baseline, current, recorded)
}

/** Reads the v8 istanbul summary's four totals; an absent or malformed summary is an error, not a skip. */
function readSummary(path) {
  const parsed = readJson(path, 'coverage summary')
  if (!parsed) throw new Error(`the coverage summary does not exist: ${path}. Run "pnpm test:coverage" first.`)
  const total = parsed.total
  if (!total || typeof total !== 'object') throw new Error(`the coverage summary at ${path} has no total object.`)
  return Object.fromEntries(METRICS.map(metric => {
    const value = total[metric]?.pct
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`the coverage summary at ${path} has no numeric total.${metric}.pct.`)
    return [metric, round(value)]
  }))
}

function readBaseline(path) {
  const parsed = readJson(path, 'baseline')
  if (!parsed) throw new Error(`the baseline does not exist: ${path}. Add it to the repository, or create it with --update.`)
  if (parsed.schemaVersion !== 1 || !parsed.platforms || typeof parsed.platforms !== 'object') throw new Error(`the baseline at ${path} is not a schemaVersion 1 baseline.`)
  for (const [platform, entry] of Object.entries(parsed.platforms)) {
    if (!entry || typeof entry !== 'object') throw new Error(`the baseline entry for ${platform} is not an object.`)
    for (const metric of METRICS) {
      if (typeof entry[metric] !== 'number' || !Number.isFinite(entry[metric])) throw new Error(`the baseline entry for ${platform} has no numeric ${metric}.`)
    }
  }
  return parsed
}

function readJson(path, what) {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`the ${what} at ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** True when every metric is at or above its mark minus the tolerance. */
function compare(current, recorded) {
  return {
    rows: METRICS.map(metric => {
      const floor = round(recorded[metric] - options.tolerance)
      return { metric, current: current[metric], recorded: recorded[metric], floor, below: current[metric] < floor, delta: round(current[metric] - recorded[metric]) }
    }),
    get ok() { return this.rows.every(row => !row.below) },
  }
}

/**
 * Records the high-water mark for this platform, preserving every other platform's entry.
 * Without `--allow-decrease`, a metric that dropped within the tolerance keeps its old mark, so
 * the mark only ever rises; a deliberate decrease records the current value instead.
 */
function writeBaseline(baseline, current, recorded) {
  const entry = { recordedAt: new Date().toISOString(), commit: commit() }
  for (const metric of METRICS) entry[metric] = !recorded || options.allowDecrease ? current[metric] : Math.max(current[metric], recorded[metric])
  baseline.platforms[options.platform] = entry
  writeFileSync(options.baseline, `${JSON.stringify(baseline, null, 2)}\n`)
  report({ ok: true, platform: options.platform, current, recorded: entry, rows: [], note: 'recorded' })
}

function commit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'unknown'
  }
}

function report({ ok, platform, current, recorded, rows, note }) {
  if (options.json) {
    console.log(JSON.stringify({ ok, platform, tolerance: options.tolerance, note, current, recorded, rows }, null, 2))
    return
  }
  console.log(`coverage ratchet (${platform}, tolerance ${format(options.tolerance)})`)
  if (note) console.log(note)
  if (rows.length) {
    console.log('metric      current  recorded  floor  result')
    for (const row of rows) console.log(`${row.metric.padEnd(11)} ${format(row.current).padStart(7)} ${format(row.recorded).padStart(9)} ${format(row.floor).padStart(6)}  ${row.below ? 'BELOW' : 'ok'}`)
  }
  console.log(`coverage ratchet: ${ok ? 'ok' : 'FAILED'}`)
}
