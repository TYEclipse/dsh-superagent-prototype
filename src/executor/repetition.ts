/**
 * Detects a no-progress loop in one Executor Session from its DeepSeek Harness session events.
 *
 * A worker that repeats a tool call without making progress burns model tokens and holds a worker slot until the
 * provider or the context window stops it. This is the bundle-sized part of the no-progress controls that harnesses
 * expose (pydantic-ai's `DetectLoops`, OpenRouter's doom-loop detection and the governed harness's no-progress stop):
 * it watches the `tool/call` and `tool/result` events that a Session already records, counts identical calls and
 * identical results across steps, and reports one steering message per repeated call and turn. It never denies a
 * call or reports a Ticket state: the worker stays responsible for its own report.
 *
 * Only repeats whose earlier result the model has already seen count, and calls made together in one step count as
 * one, because a parallel batch cannot have seen its own results. Alternating calls (an edit followed by a test,
 * again) are deliberately not a loop: that pattern makes progress.
 */
import { createHash } from 'node:crypto'

/** How many recent tool calls of a Session the detector looks at. */
export const REPETITION_WINDOW = 10
/** Identical calls with the same arguments, across steps, before a nudge. */
export const REPEATED_CALLS = 5
/** Identical calls with the same result, across steps, before a nudge. */
export const REPEATED_RESULTS = 3
/** How many nudges one turn may send, so a model that ignores the first one does not receive an unbounded stream. */
export const MAX_NUDGES = 3

/** The session events the detector reads: a turn boundary, a tool call and its result. */
export type RepetitionEvent =
  | { readonly type: 'turn/start'; readonly data: { readonly turn: number } }
  | { readonly type: 'tool/call'; readonly data: { readonly turn: number; readonly step: number; readonly callId: string
    readonly name: string; readonly arguments: string } }
  | { readonly type: 'tool/result'; readonly data: { readonly turn: number; readonly step: number
    readonly message: { readonly toolCallId: string; readonly content: readonly unknown[]; readonly isError?: boolean }
    readonly error?: { readonly name?: string; readonly code?: string } } }

/** A repeated call worth steering the Session: which pattern, how many times, and the message to deliver. */
export interface RepetitionSignal {
  pattern: 'repeated-result' | 'repeated-call'
  /** The name of the repeated tool, sanitized for a message. */
  tool: string
  /** How many times the call (or its result) repeated in the window, including the current one. */
  count: number
  /** A stable request id for the steering message, so a retry does not deliver it twice. */
  id: string
  /** The message steered into the Session. */
  text: string
}

/** One tool call in the window, with its result once the model can have seen it. */
interface Entry {
  readonly sig: string
  readonly tool: string
  readonly callId: string
  readonly step: number
  result?: string
  seen: boolean
}

/** The stable JSON form of a value, with object keys sorted so equal values have equal forms. */
function canonical(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(item => canonical(item)).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(String(value)) ?? 'null'
}

/** The raw arguments exactly as the model produced them, or their canonical parsed form when they are valid JSON. */
function argumentsOf(raw: string): string {
  try { return canonical(JSON.parse(raw) as unknown) } catch { return raw.trim() }
}

/** A short hash of one value, enough to compare and identify it without keeping the value. */
function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** The fingerprint of a tool call: its name and its arguments, independent of JSON key order. */
function fingerprint(name: string, raw: string): string {
  return digest(`${name}\0${argumentsOf(raw)}`)
}

/** The result fields the detector compares: content, the error flag and the error identity, never the call id. */
type ResultFields = Pick<Extract<RepetitionEvent, { type: 'tool/result' }>['data']['message'], 'content' | 'isError'>

/** The fingerprint of a tool result: its model-facing content, its error flag and its error identity. */
function resultFingerprint(message: ResultFields, error?: { name?: string; code?: string }): string {
  return digest(`${canonical(message.content)}\0${message.isError === true ? 'error' : 'ok'}\0${error?.name ?? ''}\0${error?.code ?? ''}`)
}

/** A tool name safe to interpolate into the steering message. */
function toolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.:-]/g, '?').slice(0, 64) || 'tool'
}

/**
 * Tracks the recent tool calls of one Session and returns one signal per repeated call and turn.
 *
 * `observe` consumes `turn/start`, `tool/call` and `tool/result` events; any other event is ignored. A new turn
 * clears the window. The detector keeps only `REPETITION_WINDOW` calls, and at most `MAX_NUDGES` signals per turn.
 */
export class Repetition {
  /** The turn whose window is kept; `-1` before the first event. */
  private turn = -1
  /** Recent calls, oldest first. */
  private entries: Entry[] = []
  /** Calls whose result has not arrived yet, by call id. */
  private readonly pending = new Map<string, Entry>()
  /** Signatures already nudged in this turn. */
  private readonly nudged = new Set<string>()
  /** Signals sent in this turn. */
  private nudges = 0

  /** Observe one session event; return a signal when this event completes a loop the Session should hear about. */
  observe(event: RepetitionEvent): RepetitionSignal | undefined {
    switch (event.type) {
      case 'turn/start': this.start(event.data.turn); return undefined
      case 'tool/call': return this.call(event.data)
      case 'tool/result': return this.result(event.data)
    }
  }

  /** Forget the current window and its nudges; the next event starts a fresh one. */
  reset(): void {
    this.turn = -1
    this.entries = []
    this.pending.clear()
    this.nudged.clear()
    this.nudges = 0
  }

  /** Start the window of a later `turn`, clearing the previous one; an earlier or repeated turn keeps it. */
  private start(turn: number): void {
    if (this.turn !== -1 && turn <= this.turn) return
    this.turn = turn
    this.entries = []
    this.pending.clear()
    this.nudged.clear()
    this.nudges = 0
  }

  /** Record a call and detect the same call repeated across steps. */
  private call(data: Extract<RepetitionEvent, { type: 'tool/call' }>['data']): RepetitionSignal | undefined {
    if (data.turn > this.turn) this.start(data.turn)
    else if (data.turn < this.turn) return undefined
    const sig = fingerprint(data.name, data.arguments)
    const entry: Entry = { sig, tool: data.name, callId: data.callId, step: data.step, seen: false }
    // A call is a repeat only when an earlier identical call in an earlier step returned a result the model has seen:
    // calls issued together in one step cannot have seen each other's results.
    const prior = this.entries.filter(item => item.sig === sig && item.seen && item.step < data.step).length
    this.entries.push(entry)
    this.pending.set(entry.callId, entry)
    while (this.entries.length > REPETITION_WINDOW) {
      const removed = this.entries.shift()
      if (removed) this.pending.delete(removed.callId)
    }
    return prior + 1 >= REPEATED_CALLS ? this.signal('repeated-call', entry, prior + 1) : undefined
  }

  /** Record a result and detect the same result returned for the same call across steps. */
  private result(data: Extract<RepetitionEvent, { type: 'tool/result' }>['data']): RepetitionSignal | undefined {
    const entry = this.pending.get(data.message.toolCallId)
    if (!entry || data.turn !== this.turn) return undefined
    this.pending.delete(data.message.toolCallId)
    entry.result = resultFingerprint({ content: data.message.content, isError: data.message.isError }, data.error)
    entry.seen = true
    // Compare the last REPEATED_RESULTS results of this call, all from earlier steps, with this one. A different
    // result between them means the model was not stuck yet; the result just produced is delivered to the next step.
    const prior = this.entries.filter(item => item !== entry && item.sig === entry.sig && item.seen && item.step < entry.step)
    const last = prior.slice(-(REPEATED_RESULTS - 1))
    const repeated = last.length === REPEATED_RESULTS - 1 && last.every(item => item.result === entry.result)
    return repeated ? this.signal('repeated-result', entry, REPEATED_RESULTS) : undefined
  }

  /** Build one steering signal unless this signature was already nudged in this turn or the turn's cap is reached. */
  private signal(pattern: RepetitionSignal['pattern'], entry: Entry, count: number): RepetitionSignal | undefined {
    if (this.nudged.has(entry.sig) || this.nudges >= MAX_NUDGES) return undefined
    this.nudged.add(entry.sig)
    this.nudges++
    const tool = toolName(entry.tool)
    const text = pattern === 'repeated-result'
      ? `No progress: \`${tool}\` returned the same result ${count} times for identical arguments. Repeating the call will not help. Change the approach; if the task cannot continue, report blocked with what is missing.`
      : `No progress: you called \`${tool}\` with identical arguments ${count} times in the last ${REPETITION_WINDOW} calls. If you are waiting for work to finish, wait for it; otherwise change the approach, or report progress with what is blocking you.`
    return { pattern, tool, count, id: `loop:${this.turn}:${pattern}:${entry.sig.slice(0, 16)}`, text }
  }
}
