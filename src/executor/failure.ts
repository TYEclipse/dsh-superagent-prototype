/**
 * Classifies an Executor failure by the recovery it permits.
 *
 * A passing network, rate-limit, overload or server failure may be retried with backoff; an authentication,
 * billing or context-length failure must reach a person instead of burning retries. This is the bundle-sized
 * part of hermes-agent's typed failure taxonomy (`agent/error_classifier.py`): the categories that describe any
 * HTTP model API, without the provider-SDK-specific members a bundle cannot act on.
 */
export type FailureKind = 'network' | 'rate-limit' | 'overloaded' | 'server' | 'auth' | 'budget' | 'context' | 'unknown'

/** A classified failure, with the hint a retry may use and whether retrying can help at all. */
export interface Failure {
  kind: FailureKind
  retryable: boolean
  /** A delay the provider asked for, when its error carries `retry-after`, in milliseconds. */
  retryAfterMs?: number
}

const NETWORK = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR|socket hang up|fetch failed|network error|network is unreachable|connection reset|connection was reset|connection refused|could not resolve host|temporary failure in name resolution|failed to connect to .* port|could not connect to server|remote end hung up|early eof|timed out|timeout/i
const RATE_LIMIT = /rate limit|too many requests|slow down|throttl|\b429\b/i
const OVERLOADED = /overloaded|at capacity|server is busy|temporarily unavailable/i
const SERVER = /internal server error|bad gateway|service unavailable|gateway timeout|\b50[0-4]\b/i
const AUTH = /unauthori[sz]ed|forbidden|invalid api key|authentication|permission denied|\b40[13]\b/i
const BUDGET = /insufficient quota|quota exceeded|billing|credit balance|payment required|out of credits|\b402\b/i
const CONTEXT = /context length|context window|maximum context|too many tokens|prompt is too long|input is too long/i
const RETRY_AFTER = /retry[-_ ]?after\s*[:=]?\s*(\d+(?:\.\d+)?)/i

/** The HTTP-like status an error carries, when it carries one directly or on `response`. */
function statusOf(error: unknown): number | undefined {
  const value = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } } | undefined
  const status = Number(value?.status ?? value?.statusCode ?? value?.response?.status)
  return Number.isFinite(status) && status >= 100 && status <= 599 ? status : undefined
}

/** One text for the error, including its code and name, which providers put the interesting part in. */
function textOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message} ${String((error as { code?: unknown }).code ?? '')}`
  return String(error)
}

/**
 * Classifies one failure. A 408 and a connection error are network failures; 429 is a rate limit; 5xx is a
 * server failure; 401/403, 402, and context-length messages are not retryable. Anything else is unknown and is
 * not retried, so an unrecognized failure reaches a person instead of looping.
 */
export function classifyFailure(error: unknown): Failure {
  const status = statusOf(error), text = textOf(error)
  const retryAfter = RETRY_AFTER.exec(text)?.[1]
  const hint = retryAfter === undefined ? {} : { retryAfterMs: Math.round(Number(retryAfter) * 1_000) }
  if (status === 401 || status === 403 || AUTH.test(text)) return { kind: 'auth', retryable: false }
  if (status === 402 || BUDGET.test(text)) return { kind: 'budget', retryable: false }
  if (CONTEXT.test(text)) return { kind: 'context', retryable: false }
  if (status === 429 || RATE_LIMIT.test(text)) return { kind: 'rate-limit', retryable: true, ...hint }
  if (OVERLOADED.test(text)) return { kind: 'overloaded', retryable: true, ...hint }
  if ((status !== undefined && status >= 500) || SERVER.test(text)) return { kind: 'server', retryable: true, ...hint }
  if (status === 408 || NETWORK.test(text)) return { kind: 'network', retryable: true, ...hint }
  return { kind: 'unknown', retryable: false }
}
