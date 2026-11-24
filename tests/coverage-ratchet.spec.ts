import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Runs the real coverage ratchet against throwaway summaries and baselines, so the test needs no
 * coverage run of its own and cannot change the checked-in mark.
 */
const ROOT = join(import.meta.dirname, '..')
const SCRIPT = join(ROOT, 'scripts', 'coverage-ratchet.mjs')
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'coverage-ratchet-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

type Metrics = { statements: number; branches: number; functions: number; lines: number }
const metrics = (value: Partial<Metrics> = {}): Metrics => ({ statements: 90, branches: 80, functions: 90, lines: 95, ...value })
const summary = (value: Partial<Metrics>) => JSON.stringify({
  total: Object.fromEntries(Object.entries(metrics(value)).map(([metric, pct]) => [metric, { pct }])),
})
const baseline = (platforms: Record<string, Metrics>) => JSON.stringify({ schemaVersion: 1, platforms })
const write = (name: string, text: string): string => {
  const path = join(dir, name)
  writeFileSync(path, text)
  return path
}
const run = (...args: string[]): { status: number; output: string } => {
  try {
    return { status: 0, output: execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string }
    return { status: failure.status ?? 1, output: `${String(failure.stdout ?? '')}${String(failure.stderr ?? '')}` }
  }
}
const args = (summaryPath: string, baselinePath: string, ...extra: string[]) => ['--summary', summaryPath, '--baseline', baselinePath, '--platform', 'test-x64', ...extra]

describe('coverage ratchet', () => {
  it('fails when the baseline is missing instead of passing silently', () => {
    const summaryPath = write('summary.json', summary({}))
    const result = run(...args(summaryPath, join(dir, 'missing-baseline.json')))
    expect(result.status).toBe(1)
    expect(result.output).toContain('the baseline does not exist')
  })

  it('passes at or above the mark and fails below the tolerance', () => {
    const baselinePath = write('baseline.json', baseline({ 'test-x64': metrics() }))
    const pass = run(...args(write('pass.json', summary({ statements: 89.95 })), baselinePath))
    expect(pass.status).toBe(0)
    expect(pass.output).toContain('coverage ratchet: ok')
    const fail = run(...args(write('fail.json', summary({ statements: 89.8 })), baselinePath))
    expect(fail.status).toBe(1)
    expect(fail.output).toContain('statements')
    expect(fail.output).toContain('BELOW')
  })

  it('keeps the old mark when a metric drops within the tolerance', () => {
    const baselinePath = write('baseline.json', baseline({ 'test-x64': metrics() }))
    const result = run(...args(write('summary.json', summary({ statements: 89.95 })), baselinePath, '--update'))
    expect(result.status).toBe(0)
    const recorded = JSON.parse(readFileSync(baselinePath, 'utf8'))
    expect(recorded.platforms['test-x64'].statements).toBe(90)
  })

  it('passes with a note when this platform has no baseline yet', () => {
    const baselinePath = write('baseline.json', baseline({ 'other-x64': metrics() }))
    const result = run(...args(write('summary.json', summary({ statements: 10 })), baselinePath))
    expect(result.status).toBe(0)
    expect(result.output).toContain('no baseline for this platform yet')
  })

  it('records a new platform with --update and then enforces it', () => {
    const baselinePath = write('baseline.json', baseline({ 'other-x64': metrics() }))
    const update = run(...args(write('summary.json', summary({ statements: 91, branches: 81, functions: 91, lines: 96 })), baselinePath, '--update'))
    expect(update.status).toBe(0)
    const recorded = JSON.parse(readFileSync(baselinePath, 'utf8'))
    expect(recorded.platforms['test-x64']).toMatchObject({ statements: 91, branches: 81, functions: 91, lines: 96 })
    expect(recorded.platforms['other-x64']).toEqual(metrics())
    const regressed = run(...args(write('regressed.json', summary({ statements: 90.5, branches: 81, functions: 91, lines: 96 })), baselinePath))
    expect(regressed.status).toBe(1)
    expect(regressed.output).toContain('statements')
  })

  it('refuses to lower a mark without --allow-decrease and accepts a deliberate decrease with it', () => {
    const baselinePath = write('baseline.json', baseline({ 'test-x64': metrics() }))
    const summaryPath = write('summary.json', summary({ statements: 85, branches: 85, functions: 95, lines: 97 }))
    const refused = run(...args(summaryPath, baselinePath, '--update'))
    expect(refused.status).toBe(1)
    expect(refused.output).toContain('refusing to lower')
    const accepted = run(...args(summaryPath, baselinePath, '--update', '--allow-decrease'))
    expect(accepted.status).toBe(0)
    const recorded = JSON.parse(readFileSync(baselinePath, 'utf8'))
    expect(recorded.platforms['test-x64']).toMatchObject({ statements: 85, branches: 85, functions: 95, lines: 97 })
  })

  it('rejects a malformed summary', () => {
    const baselinePath = write('baseline.json', baseline({ 'test-x64': metrics() }))
    const summaryPath = write('summary.json', JSON.stringify({ total: { statements: {} } }))
    const result = run(...args(summaryPath, baselinePath))
    expect(result.status).toBe(1)
    expect(result.output).toContain('numeric total.statements.pct')
  })
})
