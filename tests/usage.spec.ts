import { describe, expect, it } from 'vitest'
import { addUsage, ticketUsage, usageTotals, type TicketUsage } from '../src/app/usage.ts'
import { KV } from '../src/kv.ts'

const at = (ms: number) => new Date(ms).toISOString()
const usage = (inputTokens: number, outputTokens: number, more: Record<string, number> = {}) =>
  ({ inputTokens, outputTokens, ...more })

describe('ticket token usage', () => {
  it('records the first reported step, keeping every host counter', () => {
    const result = addUsage(undefined, { session: 'worker-1', seq: 4, time: 1_000,
      usage: usage(1_200, 300, { totalTokens: 1_500, cacheReadTokens: 800, cacheWriteTokens: 40, reasoningTokens: 90 }) })!
    expect(result).toMatchObject({ inputTokens: 1_200, outputTokens: 300, totalTokens: 1_500, cacheReadTokens: 800,
      cacheWriteTokens: 40, reasoningTokens: 90, steps: 1, updatedAt: at(1_000), sequences: { 'worker-1': 4 } })
  })

  it('adds a later step of the same Session and a step of a subagent Session', () => {
    const first = addUsage(undefined, { session: 'worker-1', seq: 2, time: 1_000, usage: usage(100, 20) })!
    const second = addUsage(first, { session: 'worker-1', seq: 3, time: 2_000, usage: usage(200, 30, { totalTokens: 240 }) })!
    const third = addUsage(second, { session: 'subagent-1', seq: 1, time: 3_000, usage: usage(50, 5) })!
    expect(third).toMatchObject({ inputTokens: 350, outputTokens: 55, totalTokens: 415, steps: 3, updatedAt: at(3_000) })
    expect(third.sequences).toEqual({ 'worker-1': 3, 'subagent-1': 1 })
  })

  it('derives a missing total from input and output, and keeps a reported total otherwise', () => {
    const derived = addUsage(undefined, { session: 'worker-1', seq: 1, time: 1_000, usage: usage(10, 5) })!
    expect(derived.totalTokens).toBe(15)
    const reported = addUsage(derived, { session: 'worker-1', seq: 2, time: 2_000, usage: usage(10, 5, { totalTokens: 30 }) })!
    expect(reported.totalTokens).toBe(45)
  })

  it('ignores a replayed or re-delivered event with the same or an older sequence', () => {
    const first = addUsage(undefined, { session: 'worker-1', seq: 10, time: 1_000, usage: usage(10, 5) })!
    expect(addUsage(first, { session: 'worker-1', seq: 10, time: 1_000, usage: usage(10, 5) })).toBeUndefined()
    expect(addUsage(first, { session: 'worker-1', seq: 9, time: 1_000, usage: usage(10, 5) })).toBeUndefined()
    // The sequence is per Session: another Session starts its own count.
    expect(addUsage(first, { session: 'subagent-1', seq: 1, time: 2_000, usage: usage(10, 5) })).toMatchObject({ steps: 2 })
  })

  it('ignores a report without any usage and clamps malformed counters', () => {
    expect(addUsage(undefined, { session: 'worker-1', seq: 1, time: 1_000, usage: usage(0, 0) })).toBeUndefined()
    const clamped = addUsage(undefined, { session: 'worker-1', seq: 1, time: 1_000,
      usage: usage(-5, 2.9, { cacheReadTokens: Number.NaN, cacheWriteTokens: Number.POSITIVE_INFINITY }) })!
    expect(clamped).toMatchObject({ inputTokens: 0, outputTokens: 2, totalTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it('strips the sequence bookkeeping from the display shape and reads it from the Store', () => {
    const record: TicketUsage = { inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0, cacheWriteTokens: 0,
      reasoningTokens: 0, steps: 1, updatedAt: at(1_000), sequences: { 'worker-1': 1 } }
    expect(usageTotals(record)).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15, cacheReadTokens: 0,
      cacheWriteTokens: 0, reasoningTokens: 0, steps: 1, updatedAt: at(1_000) })
    expect(usageTotals(undefined)).toBeUndefined()
    const store = { get: <V>(key: string): V | undefined =>
      key === KV.usage.ticket('t1') ? record as unknown as V : undefined }
    expect(ticketUsage(store, 't1')).toMatchObject({ totalTokens: 15, steps: 1 })
    expect(ticketUsage(store, 't2')).toBeUndefined()
  })
})
