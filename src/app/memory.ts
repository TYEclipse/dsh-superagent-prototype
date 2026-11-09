/**
 * Durable project memory: compact notes about finished Tickets, kept in the state store and rendered into
 * Executor prompts, so later work in the same repository can reuse what earlier work learned.
 *
 * The notes are facts reported by an Executor or recorded when a Ticket ends; the prompt that carries them
 * says so, and they never grant authority (the Policy and the Mandates still decide what a Ticket may do).
 */
import { latestReport, type Ticket, type TicketOutcome } from '../core/model.ts'
import { KV, type Key } from '../kv.ts'
import type { Store } from './store.ts'

/** One finished Ticket, as later Executors read it. */
export interface MemoryNote {
  ticketId: string
  at: string
  title: string
  outcome: TicketOutcome
  /** The latest Report's summary, whitespace-collapsed and bounded. */
  summary: string
}

/** Notes kept: the newest, and enough history for a project of ordinary size without growing the prompt. */
export const MEMORY_NOTES = 100
/** Characters kept from one Report summary, and from a whole rendered memory section. */
export const MEMORY_NOTE_CHARS = 400
export const MEMORY_CHARS = 3_000
/** Notes older than this move out of the prompt into the archive, which keeps them without deleting them. */
export const MEMORY_MAX_AGE_DAYS = 90

/** Collapse whitespace and bound one note's field, so a note is always one prompt line. */
const oneLine = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * The project memory, written when a Ticket ends and read by `Prompts` on every worker prompt.
 * `remember` is idempotent per Ticket, so a restart or a repeated end event cannot duplicate a note.
 */
export class Memory {
  constructor(private readonly store: Pick<Store, 'get' | 'set'>) {}

  /** The remembered Tickets, newest first. */
  list(): MemoryNote[] {
    return this.store.get(KV.memory.notes) ?? []
  }

  /** The notes that aged out of the prompt; kept for history, never rendered. */
  archive(): MemoryNote[] {
    return this.store.get(KV.memory.archive) ?? []
  }

  /**
   * Moves notes older than `maxAgeDays` to the archive, so an old project does not crowd the worker prompt.
   * The archive is append-only in practice: a curated note is never deleted, and running this again changes nothing.
   */
  curate(now = new Date(), maxAgeDays = MEMORY_MAX_AGE_DAYS): void {
    const cutoff = now.getTime() - maxAgeDays * 86_400_000
    const old = this.list().filter(note => {
      const at = Date.parse(note.at)
      return Number.isFinite(at) && at < cutoff
    })
    if (!old.length) return
    // Compare by ticket id: `list()` deserializes a fresh array each call, so object identity does not survive it.
    const archived = new Set(old.map(note => note.ticketId))
    this.store.set(KV.memory.notes, this.list().filter(note => !archived.has(note.ticketId)))
    this.store.set(KV.memory.archive, [...this.archive(), ...old])
  }

  /** Records a Ticket that ended: its title, outcome and latest Report summary, once, at the front of the list. */
  remember(ticket: Ticket, at: string): void {
    const notes = this.list()
    if (notes.some(note => note.ticketId === ticket.id)) return
    const report = latestReport(ticket)
    const note: MemoryNote = { ticketId: ticket.id, at, title: oneLine(ticket.title, 120),
      outcome: ticket.ended?.outcome ?? 'completed', summary: oneLine(report?.summary ?? '', MEMORY_NOTE_CHARS) }
    this.store.set(KV.memory.notes, [note, ...notes].slice(0, MEMORY_NOTES))
  }
}

/**
 * The lines a worker prompt receives, newest first, within `max` characters; '' when nothing is remembered.
 * Each line is one fact from a finished Ticket; the prompt's own preamble tells the model it is not an instruction.
 */
export function renderMemory(notes: readonly MemoryNote[], max = MEMORY_CHARS): string {
  const lines: string[] = []
  let used = 0
  for (const note of notes) {
    const line = `- ${note.title} — ${note.outcome}${note.summary ? `: ${note.summary}` : ''}`
    if (used + line.length + (lines.length ? 1 : 0) > max) break
    lines.push(line)
    used += line.length + (lines.length > 1 ? 1 : 0)
  }
  return lines.join('\n')
}

/** The key a note is stored under, exposed for tests and diagnostics. */
export const memoryKey: Key<MemoryNote[]> = KV.memory.notes
