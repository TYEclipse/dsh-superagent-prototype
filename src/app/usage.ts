/**
 * Per-Ticket token accounting from the host's `assistant/message` usage reports, persisted in the Store's KV area.
 * The host reports the tokens of every model step on that step's assistant message; the Executor attributes the reports of
 * a Ticket's worker and subagent Sessions to the Ticket, so an operator can see what a Ticket spent without opening transcripts.
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { KV } from '../kv.ts'
import type { Store } from './store.ts'

/** Token totals a Ticket's worker and subagent Sessions have reported, in the host's usage shape. */
export interface TicketUsageTotals {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  /** Model steps whose usage was reported; one per `assistant/message` event that carried usage. */
  steps: number
  /** When the latest counted step ran, as the host stamped it. */
  updatedAt: string
}

/** Persisted as `KV.usage.ticket(id)`: the totals plus the last Session event sequence already counted per Session. */
export interface TicketUsage extends TicketUsageTotals {
  /** Last counted `seq` per Session id, so a replayed or re-delivered event is not added twice. */
  sequences: Record<string, number>
}

/** A non-negative integer token count; malformed adapter values count as zero. */
const count = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

/**
 * Adds one host usage report to a Ticket's totals.
 * @returns the updated record, or `undefined` when the event was already counted or reported no tokens.
 */
export function addUsage(previous: TicketUsage | undefined, event: { session: string; seq: number; time: number; usage: TokenUsage }): TicketUsage | undefined {
  const sequence = Number.isSafeInteger(event.seq) ? event.seq : 0
  if (previous && sequence > 0 && (previous.sequences[event.session] ?? 0) >= sequence) return undefined
  const inputTokens = count(event.usage.inputTokens), outputTokens = count(event.usage.outputTokens)
  const totalTokens = count(event.usage.totalTokens) || inputTokens + outputTokens
  const cacheReadTokens = count(event.usage.cacheReadTokens), cacheWriteTokens = count(event.usage.cacheWriteTokens)
  const reasoningTokens = count(event.usage.reasoningTokens)
  // An adapter that reported no accounting at all contributes no step: a zero row would only add noise to the ledger.
  if (!inputTokens && !outputTokens && !totalTokens && !cacheReadTokens && !cacheWriteTokens && !reasoningTokens) return undefined
  const base = previous ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    reasoningTokens: 0, steps: 0, updatedAt: new Date(event.time).toISOString(), sequences: {} }
  return {
    inputTokens: base.inputTokens + inputTokens,
    outputTokens: base.outputTokens + outputTokens,
    totalTokens: base.totalTokens + totalTokens,
    cacheReadTokens: base.cacheReadTokens + cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + cacheWriteTokens,
    reasoningTokens: base.reasoningTokens + reasoningTokens,
    steps: base.steps + 1,
    updatedAt: new Date(event.time).toISOString(),
    sequences: { ...base.sequences, [event.session]: sequence },
  }
}

/** The display shape of a Ticket's usage, without the per-Session sequence bookkeeping. */
export function usageTotals(usage: TicketUsage | undefined): TicketUsageTotals | undefined {
  if (!usage) return undefined
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens,
    cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens, reasoningTokens: usage.reasoningTokens,
    steps: usage.steps, updatedAt: usage.updatedAt }
}

/** Reads a Ticket's token totals from the Store; `undefined` until a worker or subagent reports usage. */
export function ticketUsage(store: Pick<Store, 'get'>, ticketId: string): TicketUsageTotals | undefined {
  return usageTotals(store.get(KV.usage.ticket(ticketId)))
}
