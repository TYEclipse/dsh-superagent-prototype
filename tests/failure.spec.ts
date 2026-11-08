import { describe, expect, it } from 'vitest'
import { classifyFailure } from '../src/executor/failure.ts'

describe('failure classification', () => {
  it('retries passing network, rate-limit, overload and server failures', () => {
    expect(classifyFailure(Object.assign(new Error('too many requests'), { status: 429 }))).toEqual({ kind: 'rate-limit', retryable: true })
    expect(classifyFailure(Object.assign(new Error('bad gateway'), { status: 502 }))).toEqual({ kind: 'server', retryable: true })
    expect(classifyFailure(Object.assign(new Error('read'), { code: 'ECONNRESET' })).kind).toBe('network')
    expect(classifyFailure(new Error('fetch failed')).retryable).toBe(true)
    expect(classifyFailure(new Error('the model is overloaded')).kind).toBe('overloaded')
    expect(classifyFailure(Object.assign(new Error('request timeout'), { status: 408 })).kind).toBe('network')
  })

  it('does not retry failures a person must resolve', () => {
    expect(classifyFailure(Object.assign(new Error('nope'), { status: 401 }))).toEqual({ kind: 'auth', retryable: false })
    expect(classifyFailure(new Error('context length exceeded')).kind).toBe('context')
    expect(classifyFailure(new Error('insufficient quota for this billing cycle')).kind).toBe('budget')
    expect(classifyFailure(new Error('something the classifier does not know'))).toEqual({ kind: 'unknown', retryable: false })
  })

  it('carries the provider retry-after hint when the error mentions one', () => {
    expect(classifyFailure(Object.assign(new Error('rate limit; retry-after: 30'), { status: 429 })).retryAfterMs).toBe(30_000)
    expect(classifyFailure(new Error('429 Retry-After=2.5')).retryAfterMs).toBe(2_500)
  })
})
