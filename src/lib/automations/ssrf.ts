import net from 'node:net'
import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

interface IPv4CIDR {
  network: number
  mask: number
}

function parseIPv4ToUint32(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let num = 0
  for (let i = 0; i < 4; i++) {
    const octet = Number(parts[i])
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    num = ((num << 8) | octet) >>> 0
  }
  return num
}

function makeMask(prefix: number): number {
  return prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
}

function makeCIDR(ip: string, prefix: number): IPv4CIDR {
  const num = parseIPv4ToUint32(ip)!
  const mask = makeMask(prefix)
  return { network: (num & mask) >>> 0, mask }
}

const DISALLOWED_IPV4_RANGES: IPv4CIDR[] = [
  makeCIDR('0.0.0.0', 8), makeCIDR('10.0.0.0', 8),
  makeCIDR('100.64.0.0', 10), makeCIDR('127.0.0.0', 8),
  makeCIDR('169.254.0.0', 16), makeCIDR('172.16.0.0', 12),
  makeCIDR('192.0.0.0', 24), makeCIDR('192.0.2.0', 24),
  makeCIDR('192.88.99.0', 24), makeCIDR('192.168.0.0', 16),
  makeCIDR('198.18.0.0', 15), makeCIDR('198.51.100.0', 24),
  makeCIDR('203.0.113.0', 24), makeCIDR('224.0.0.0', 4),
  makeCIDR('240.0.0.0', 4),
]

function isDisallowedIPv4(ip: string): boolean {
  const num = parseIPv4ToUint32(ip)
  if (num === null) return true
  return DISALLOWED_IPV4_RANGES.some((range) => ((num & range.mask) >>> 0) === range.network)
}

function expandIPv6(ip: string): number[] | null {
  const lower = ip.toLowerCase()
  if (lower.includes('.')) {
    const lastColon = lower.lastIndexOf(':')
    if (lastColon === -1) return null
    const ipv4Part = lower.slice(lastColon + 1)
    const ipv4Num = parseIPv4ToUint32(ipv4Part)
    if (ipv4Num === null) return null
    const prefix = lower.slice(0, lastColon)
    return expandIPv6(`${prefix}:${((ipv4Num >>> 16) & 0xffff).toString(16)}:${(ipv4Num & 0xffff).toString(16)}`)
  }
  const parts = lower.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts[1] ? parts[1].split(':') : []
  if (parts.length === 1) {
    if (head.length !== 8 || head.some((h) => !/^[0-9a-f]{1,4}$/.test(h))) return null
    return head.map((h) => parseInt(h, 16))
  }
  const missing = 8 - (head.length + tail.length)
  if (missing < 1) return null
  const full = [...head, ...new Array(missing).fill('0'), ...tail]
  if (full.length !== 8 || full.some((h) => h !== '0' && !/^[0-9a-f]{1,4}$/.test(h))) return null
  return full.map((h) => parseInt(h || '0', 16))
}

function isDisallowedIPv6(ip: string): boolean {
  const words = expandIPv6(ip.toLowerCase())
  if (!words) return true

  // Unspecified and loopback.
  if (words.every((word) => word === 0)) return true
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true

  // IPv4-mapped IPv6, including hexadecimal forms such as ::ffff:7f00:1.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mappedIPv4 = [
      (words[6] >>> 8) & 0xff,
      words[6] & 0xff,
      (words[7] >>> 8) & 0xff,
      words[7] & 0xff,
    ].join('.')
    return isDisallowedIPv4(mappedIPv4)
  }

  // IPv4-compatible ::/96 is deprecated and must not be used as an SSRF bypass.
  if (words.slice(0, 6).every((word) => word === 0)) return true

  const firstWord = words[0]

  // Only accept IPv6 global-unicast space (2000::/3) as a baseline.
  // This rejects non-global special-use allocations by default.
  if (firstWord < 0x2000 || firstWord > 0x3fff) return true

  // IETF protocol assignments (2001::/23), 6to4 (2002::/16),
  // and documentation-only space (3fff::/20).
  if (firstWord === 0x2001 && words[1] <= 0x01ff) return true
  if (firstWord === 0x2002) return true
  // Documentation-only IPv6 prefix (RFC 3849): 2001:db8::/32.
  if (firstWord === 0x2001 && words[1] === 0x0db8) return true
  if (firstWord === 0x3fff && words[1] <= 0x0fff) return true

  return false
}
export function isPrivateOrReservedIP(ip: string): boolean {
  const version = net.isIP(ip)
  if (version === 4) return isDisallowedIPv4(ip)
  if (version === 6) return isDisallowedIPv6(ip)
  return true
}

const DISALLOWED_HOSTNAMES = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'metadata.google.internal', 'instance-data',
])

export function isDisallowedHost(host: string): boolean {
  if (!host) return true
  let cleanHost = host.toLowerCase().trim()
  if (cleanHost.endsWith('.')) cleanHost = cleanHost.slice(0, -1)
  if (cleanHost.startsWith('[') && cleanHost.endsWith(']')) cleanHost = cleanHost.slice(1, -1)
  if (DISALLOWED_HOSTNAMES.has(cleanHost)) return true
  if (cleanHost.endsWith('.localhost') || cleanHost.endsWith('.local') || cleanHost.endsWith('.internal')) return true
  if (net.isIP(cleanHost)) return isPrivateOrReservedIP(cleanHost)
  return false
}

export interface WebhookValidationResult {
  valid: boolean
  error?: string
  url?: URL
}

export function validateWebhookUrl(urlString: string): WebhookValidationResult {
  if (!urlString || typeof urlString !== 'string') return { valid: false, error: 'webhook URL is required' }
  let parsed: URL
  try { parsed = new URL(urlString) } catch { return { valid: false, error: 'webhook URL is not a valid URL' } }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { valid: false, error: 'webhook URL must use http or https' }
  if (parsed.username || parsed.password) return { valid: false, error: 'webhook URL must not contain credentials' }
  if (isDisallowedHost(parsed.hostname)) {
    return { valid: false, error: 'webhook URL cannot point to internal or private destinations' }
  }
  return { valid: true, url: parsed }
}

export type DNSLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>

export interface SafeWebhookTarget {
  url: URL
  address: string
  family: number
}

/** Resolve once, reject the entire DNS answer set if any address is unsafe, and return one IP to pin the connection to. */
export async function resolveSafeWebhookTarget(
  urlString: string,
  lookup: DNSLookup = (hostname) => dns.lookup(hostname, { all: true }),
): Promise<SafeWebhookTarget> {
  const result = validateWebhookUrl(urlString)
  if (!result.valid || !result.url) throw new Error(result.error || 'Invalid webhook URL')
  const url = result.url
  let hostname = url.hostname.toLowerCase().trim()
  if (hostname.startsWith('[') && hostname.endsWith(']')) hostname = hostname.slice(1, -1)

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) throw new Error('Webhook target resolves to disallowed address')
    return { url, address: hostname, family: net.isIP(hostname) }
  }

  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await lookup(hostname)
  } catch (err) {
    throw new Error(`DNS resolution failed for webhook host ${hostname}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!addresses.length) throw new Error(`DNS resolution failed for webhook host ${hostname}: no addresses returned`)
  for (const record of addresses) {
    if (isPrivateOrReservedIP(record.address)) {
      throw new Error(`Webhook target resolves to disallowed address: ${record.address}`)
    }
  }
  return { url, address: addresses[0].address, family: addresses[0].family }
}

export async function assertSafeWebhookUrl(urlString: string): Promise<URL> {
  return (await resolveSafeWebhookTarget(urlString)).url
}

/** POST to the validated IP directly. The URL hostname remains the HTTP Host header and HTTPS TLS server name. */

export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024
export const MAX_WEBHOOK_HEADERS = 32
export const MAX_WEBHOOK_HEADER_BYTES = 16 * 1024

/**
 * Validate the actual outbound webhook body and custom headers.
 * Returns an error message when invalid, otherwise null.
 */
export function validateWebhookRequest(body: unknown, headers: unknown = {}): string | null {
  if (typeof body !== 'string') {
    return 'webhook body must be a string'
  }

  if (Buffer.byteLength(body, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    return 'webhook body exceeds the 1 MiB limit'
  }

  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    return 'webhook headers must be an object'
  }

  const entries = Object.entries(headers as Record<string, unknown>)

  if (entries.length > MAX_WEBHOOK_HEADERS) {
    return `webhook headers exceed the ${MAX_WEBHOOK_HEADERS}-header limit`
  }

  let totalBytes = 0

  for (const [name, value] of entries) {
    // HTTP field-name token characters only.
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      return `invalid webhook header name: ${name}`
    }

    if (typeof value !== 'string') {
      return `webhook header "${name}" must have a string value`
    }

    // Reject CR/LF and all other ASCII control characters.
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      return `webhook header "${name}" contains unsafe control characters`
    }

    const lowerName = name.toLowerCase()
    if (lowerName === 'content-length' || lowerName === 'transfer-encoding') {
      return `webhook header "${name}" is not allowed`
    }

    totalBytes += Buffer.byteLength(`${name}: ${value}\r\n`, 'utf8')
  }

  if (totalBytes > MAX_WEBHOOK_HEADER_BYTES) {
    return `webhook headers exceed the ${MAX_WEBHOOK_HEADER_BYTES}-byte limit`
  }

  return null
}

export async function postSafeWebhook(
  urlString: string,
  body: string,
  headers: Record<string, string> = {},
  timeoutMs = 10_000,
  lookup: DNSLookup = (hostname) => dns.lookup(hostname, { all: true }),
): Promise<{ status: number; ok: boolean }> {
  const validationError = validateWebhookRequest(body, headers)
  if (validationError) throw new Error(validationError)

  const timeoutError = new Error('Webhook request timed out')
  let activeRequest: http.ClientRequest | undefined
  let timedOut = false
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined

  // One hard deadline covers DNS resolution, connection, and the full response.
  const operation = (async (): Promise<{ status: number; ok: boolean }> => {
    const target = await resolveSafeWebhookTarget(urlString, lookup)
    // A late DNS answer must never start a request after the deadline.
    if (timedOut) throw timeoutError

    const { url, address, family } = target
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const requestHeaders: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'host') requestHeaders[key] = value
    }
    requestHeaders.Host = url.host

    const requestFn = url.protocol === 'https:' ? https.request : http.request
    return await new Promise((resolve, reject) => {
      let settled = false
      const finishResolve = (value: { status: number; ok: boolean }) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const finishReject = (error: Error) => {
        if (settled) return
        settled = true
        reject(error)
      }

      try {
        const req = requestFn({
          protocol: url.protocol,
          hostname: address,
          family,
          port: url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: requestHeaders,
          agent: false,
          ...(url.protocol === 'https:' ? {
            rejectUnauthorized: true,
            ...(!net.isIP(hostname) ? { servername: hostname } : {}),
          } : {}),
        }, (res) => {
          res.resume()
          res.on('end', () => {
            const status = res.statusCode ?? 0
            finishResolve({ status, ok: status >= 200 && status < 300 })
          })
        })
        activeRequest = req
        req.on('error', (error) => finishReject(error instanceof Error ? error : new Error(String(error))))
        // Socket inactivity timeout supplements the hard overall deadline below.
        req.setTimeout(timeoutMs, () => req.destroy(timeoutError))
        req.end(body)
      } catch (error) {
        finishReject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  })()

  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(() => {
      timedOut = true
      activeRequest?.destroy(timeoutError)
      reject(timeoutError)
    }, Math.max(1, timeoutMs))
    deadlineTimer.unref?.()
  })

  try {
    return await Promise.race([operation, deadline])
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer)
  }
}
