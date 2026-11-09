import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Memory, MEMORY_NOTE_CHARS, MEMORY_NOTES, renderMemory, type MemoryNote } from '../src/app/memory.ts'
import { Prompts, composePrompt, defaultPrompts, memorySection } from '../src/app/prompts.ts'
import type { Ticket } from '../src/core/model.ts'
import { KV } from '../src/kv.ts'
import { Store } from '../src/app/store.ts'

let dir: string
let store: Store
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'memory-')); store = new Store(join(dir, 'db')) })
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }) })
const ticket = (n: number, overrides: Partial<Ticket> = {}): Ticket => ({ id: `t${n}`, title: `Fix the regression ${n}`,
  ended: { at: `2026-10-0${n}T00:00:00.000Z`, by: 'executor', outcome: 'completed' }, assignments: [], ...overrides } as Ticket)
const note = (n: number): MemoryNote => ({ ticketId: `t${n}`, at: `2026-10-0${n}T00:00:00.000Z`, title: `Fix ${n}`, outcome: 'completed', summary: `Learned ${n}.` })

describe('project memory', () => {
  it('remembers a finished ticket once, newest first, with its outcome and latest report summary', () => {
    const memory = new Memory(store)
    memory.remember(ticket(1, { assignments: [{ id: 'a1', state: 'ended', createdAt: '', report: { state: 'ready', summary: 'Checked the build.\n\nRan the tests.', at: '' } }] as never }), '2026-10-01T00:00:00.000Z')
    memory.remember(ticket(2, { ended: { at: '', by: 'executor', outcome: 'merged' } }), '2026-10-02T00:00:00.000Z')
    memory.remember(ticket(1), '2026-10-03T00:00:00.000Z')
    expect(memory.list()).toEqual([
      { ticketId: 't2', at: '2026-10-02T00:00:00.000Z', title: 'Fix the regression 2', outcome: 'merged', summary: '' },
      { ticketId: 't1', at: '2026-10-01T00:00:00.000Z', title: 'Fix the regression 1', outcome: 'completed', summary: 'Checked the build. Ran the tests.' }])
  })

  it('bounds a note and keeps the newest notes within the cap', () => {
    const memory = new Memory(store)
    memory.remember(ticket(1, { assignments: [{ id: 'a1', state: 'ended', createdAt: '',
      report: { state: 'ready', summary: 'start\n\n' + 'detail '.repeat(200), at: '' } }] as never }), '2026-10-01T00:00:00.000Z')
    const [first] = memory.list()
    expect(first!.summary.length).toBeLessThanOrEqual(MEMORY_NOTE_CHARS)
    expect(first!.summary).not.toContain('\n')
    expect(first!.summary.endsWith('…')).toBe(true)
    for (let n = 0; n < MEMORY_NOTES + 5; n++) memory.remember(ticket(n), `2026-11-01T00:00:${String(n).padStart(2, '0')}.000Z`)
    expect(memory.list()).toHaveLength(MEMORY_NOTES)
    expect(memory.list()[0]!.ticketId).toBe(`t${MEMORY_NOTES + 4}`)
  })

  it('renders the notes newest first within a character budget, and nothing when memory is empty', () => {
    expect(renderMemory([])).toBe('')
    const notes = [note(3), note(2), note(1)]
    expect(renderMemory(notes).split('\n')).toEqual([
      '- Fix 3 — completed: Learned 3.', '- Fix 2 — completed: Learned 2.', '- Fix 1 — completed: Learned 1.'])
    expect(renderMemory(notes, 40).split('\n')).toEqual(['- Fix 3 — completed: Learned 3.'])
  })

  it('archives notes older than the window and keeps the recent ones in the prompt', () => {
    const memory = new Memory(store)
    store.set(KV.memory.notes, [
      { ...note(3), at: '2026-11-01T00:00:00.000Z' },
      { ...note(2), at: '2026-10-01T00:00:00.000Z' },
      { ...note(1), at: '2025-01-01T00:00:00.000Z' }])
    memory.curate(new Date('2026-11-09T00:00:00.000Z'), 90)
    expect(memory.list().map(item => item.ticketId)).toEqual(['t3', 't2'])
    expect(memory.archive().map(item => item.ticketId)).toEqual(['t1'])
    memory.curate(new Date('2026-11-09T00:00:00.000Z'), 90)
    expect(memory.archive()).toHaveLength(1)
    expect(renderMemory(memory.list())).toContain('Fix 3')
    expect(renderMemory(memory.list())).not.toContain('Fix 1')
  })

  it('adds one generated Project memory section to the worker prompt, and never to the main Session', () => {
    store.set(KV.memory.notes, [note(2), note(1)])
    const section = memorySection(defaultPrompts(), store.get(KV.memory.notes)!)
    expect(section).toContain('## Project memory')
    expect(section).toContain('- Fix 2 — completed: Learned 2.')
    expect(composePrompt(defaultPrompts(), 'worker')).not.toContain('## Project memory')
    expect(composePrompt(defaultPrompts(), 'worker', undefined, undefined, section)).toContain('- Fix 1 — completed: Learned 1.')
    expect(composePrompt(defaultPrompts(), 'orchestrator', undefined, undefined, section)).not.toContain('## Project memory')
    const prompts = new Prompts(store, () => 100_000, () => undefined, () => false)
    expect(prompts.compose(defaultPrompts(), 'worker')).toContain('- Fix 2 — completed: Learned 2.')
    expect(prompts.compose(defaultPrompts(), 'orchestrator')).not.toContain('## Project memory')
    expect(prompts.preview(defaultPrompts()).worker).toContain('- Fix 1 — completed: Learned 1.')
  })
})
