import { describe, expect, it } from 'vitest'
import { redactSecrets } from '../src/infra/redact.ts'

/** Each case: what leaks, the text, and the text with the credential masked. */
const masked: [string, string, string][] = [
  ['a GitHub personal access token', 'push failed: ghp_1234567890abcdefghij', 'push failed: ghp_1…ghij'],
  ['a GitHub OAuth token', 'oauth token gho_abcdefghijklmnopqrstuvwxyz012345', 'oauth token gho_a…2345'],
  ['a GitHub server-to-server token', 'server token ghs_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', 'server token ghs_A…2345'],
  ['a fine-grained GitHub token', 'pat github_pat_11ABCDEFGHIJKLMNOPQRST_abcdefghijklmnopqrstuvwxyz', 'pat github_pat_1…wxyz'],
  ['a bearer credential', 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123', 'Authorization: Bearer eyJh…c123'],
  ['a bearer credential in a JSON dump', '"Authorization": "Bearer abcdefghijklmnop"', '"Authorization": "Bearer abcd…mnop"'],
  ['an x-api-key header', 'x-api-key: sk_live_1234567890abcdef', 'x-api-key: sk_l…cdef'],
  ['an x-api-key field in a JSON dump', '"x-api-key": "sk_live_1234567890abcdef", "ok": true', '"x-api-key": "sk_l…cdef", "ok": true'],
  ['an api-key assignment', 'api-key=abc1234567890', 'api-key=abc1…7890'],
  ['a Cookie header', 'Cookie: session=abc123', 'Cookie: sess…c123'],
  ['a Set-Cookie header', 'Set-Cookie: abc123456789', 'Set-Cookie: abc1…6789'],
  ['a Set-Cookie field in a JSON dump', '"Set-Cookie": "session=abc123; Path=/", "next": 1', '"Set-Cookie": "sess…th=/", "next": 1'],
  ['credentials in a URL', 'fatal: unable to access https://deploy:hunter2secret@github.com/o/r.git',
    'fatal: unable to access https://deploy:hunt…cret@github.com/o/r.git'],
  ['a token query parameter', 'https://example.test/callback?token=abcdef123456&state=ok',
    'https://example.test/callback?token=abcd…3456&state=ok'],
  ['an access_token query parameter', 'https://example.test/callback?access_token=XYZ1234567890abc&state=ok',
    'https://example.test/callback?access_token=XYZ1…0abc&state=ok'],
  ['an AWS access key id', 'aws key AKIAIOSFODNN7EXAMPLE here', 'aws key AKIA…MPLE here'],
  ['a private-key block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsecret\n-----END RSA PRIVATE KEY-----',
    '-----BEGIN RSA PRIVATE KEY-----…-----END RSA PRIVATE KEY-----'],
  ['a private-key block the output cut off', '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk', '-----BEGIN OPENSSH PRIVATE KEY-----…'],
]
const ordinary = ['token expired', 'the cookie: chocolate chip', 'the budget: 12 tokens', 'api keys are rotated daily',
  'Authorization uses bearer credentials', 'https://user@example.test/x', 'ghp_short']

describe('redactSecrets', () => {
  it.each(masked)('masks %s and keeps a visible hint', (_leak, text, expected) => {
    expect(redactSecrets(text)).toBe(expected)
  })
  it.each(masked)('is idempotent for %s', (_leak, text) => {
    const once = redactSecrets(text)
    expect(redactSecrets(once)).toBe(once)
  })
  it('masks every credential in a diagnostic that carries several', () => {
    const text = 'fatal: GET https://bot:ghp_1234567890abcdefghij@github.com/x?access_token=abcdef123456 failed\n'
      + 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature\nCookie: session=abcdef123456'
    const redacted = redactSecrets(text)
    expect(redacted).toBe('fatal: GET https://bot:ghp_1…ghij@github.com/x?access_token=abcd…3456 failed\n'
      + 'Authorization: Bearer eyJh…ture\nCookie: sess…3456')
    expect(redactSecrets(redacted)).toBe(redacted)
  })
  it.each(ordinary)('leaves ordinary text alone: %s', text => {
    expect(redactSecrets(text)).toBe(text)
  })
})
