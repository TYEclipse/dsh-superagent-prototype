/**
 * Redaction of credentials in subprocess output before it becomes Ticket state, a worker's continuation message, a health detail or a management API body.
 * Pure and idempotent: every mask keeps a short prefix and suffix for debugging (`ghp_1…abcd`), and a second pass leaves a mask alone.
 */
const MASK = '…'

/** Masks one captured secret, keeping its first `head` and last `tail` characters; a value that is already masked is returned unchanged. */
function mask(value: string, head = 4, tail = 4): string {
  if (value.includes(MASK)) return value
  if (value.length <= head + tail + 1) return MASK
  return `${value.slice(0, head)}${MASK}${value.slice(-tail)}`
}

/** GitHub personal access, OAuth, user-to-server, server-to-server and refresh tokens; the scheme prefix stays visible. */
const GITHUB_TOKEN = /\b(gh[posru]_|github_pat_)([A-Za-z0-9_]{8,})/g
/** A bearer or basic credential in an `Authorization` header, in plain text or a JSON dump. */
const AUTHORIZATION = /((?<![\w-])Authorization["']?\s*:\s*["']?(?:Bearer|Basic)\s+)([^\s,;"']+)/gi
/** An API-key header or assignment, in plain text or a JSON dump. */
const API_KEY = /((?<![\w-])(?:x-api-key|api-key)["']?\s*[:=]\s*["']?)([^\s,;"']+)/gi
/** A `Cookie` or `Set-Cookie` header: its value, quoted in a JSON dump or running to the end of the line in plain text. */
const COOKIE = /((?<![\w-])(?:Set-Cookie|Cookie)["']?\s*:\s*)(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\r\n]*))/g
/** Credentials in a URL: the user name stays visible, the password is masked. */
const URL_CREDENTIALS = /(https?:\/\/[^\s/:@]+:)([^\s/@]+)(@)/gi
/** The value of a `token` or `access_token` query parameter. */
const QUERY_TOKEN = /([?&](?:access_token|token)=)([^&\s"'#]+)/gi
/** An AWS access key id. */
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/g
/** A PEM private-key block, including one the output cut off before its end marker. */
const PRIVATE_KEY = /-----BEGIN ([A-Z0-9 ]*?)PRIVATE KEY-----([\s\S]*?)(?:-----END \1PRIVATE KEY-----|$)/g

/**
 * Masks the credentials in text that a subprocess printed, so the text may become state, a Report, a continuation message or an HTTP body.
 * Idempotent: masking a redacted string returns it byte for byte, and prose such as `token expired` or `the cookie: …` is left alone.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(PRIVATE_KEY, (whole, label: string, body: string) => {
      if (body.includes(MASK)) return whole
      const end = `-----END ${label}PRIVATE KEY-----`
      return `-----BEGIN ${label}PRIVATE KEY-----${MASK}${whole.endsWith(end) ? end : ''}`
    })
    .replace(GITHUB_TOKEN, (whole, scheme: string, token: string) => token.includes(MASK) ? whole : `${scheme}${mask(token, 1, 4)}`)
    .replace(AUTHORIZATION, (_, header: string, token: string) => header + mask(token))
    .replace(API_KEY, (_, header: string, key: string) => header + mask(key))
    .replace(COOKIE, (whole, header: string, double?: string, single?: string, plain?: string) => {
      if (double !== undefined) return `${header}"${mask(double)}"`
      if (single !== undefined) return `${header}'${mask(single)}'`
      return header + mask(plain ?? '')
    })
    .replace(URL_CREDENTIALS, (whole, head: string, password: string, at: string) => password.includes(MASK) ? whole : `${head}${mask(password)}${at}`)
    .replace(QUERY_TOKEN, (whole, parameter: string, value: string) => value.includes(MASK) ? whole : parameter + mask(value))
    .replace(AWS_KEY, key => mask(key))
}
