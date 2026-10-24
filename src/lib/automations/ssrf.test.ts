import http from 'node:http'
import https from 'node:https'
import { describe, expect, it, vi } from 'vitest'
import {
  isPrivateOrReservedIP,
  isDisallowedHost,
  validateWebhookUrl,
  assertSafeWebhookUrl,
  resolveSafeWebhookTarget,
  postSafeWebhook,
  validateWebhookRequest,
  MAX_WEBHOOK_BODY_BYTES,
  MAX_WEBHOOK_HEADERS,
  MAX_WEBHOOK_HEADER_BYTES,
  type DNSLookup,
} from './ssrf'

describe('SSRF Protection - IP Range Validation', () => {
  it('blocks IPv4 loopback and private ranges', () => {
    for (const ip of ['127.0.0.1', '127.255.255.254', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254']) {
      expect(isPrivateOrReservedIP(ip)).toBe(true)
    }
    expect(isPrivateOrReservedIP('8.8.8.8')).toBe(false)
  })

  it('blocks reserved IPv4 ranges', () => {
    for (const ip of ['0.0.0.0', '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) {
      expect(isPrivateOrReservedIP(ip)).toBe(true)
    }
  })

  it('blocks IPv6 loopback, local, multicast and mapped private IPs', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fc00::1', 'fd12:3456:789a::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPrivateOrReservedIP(ip)).toBe(true)
    }
    expect(isPrivateOrReservedIP('2606:4700:4700::1111')).toBe(false)
  })
})

describe('SSRF Protection - Hostname and URL Validation', () => {
  it('identifies disallowed hostnames', () => {
    for (const host of ['localhost', 'sub.localhost', 'internal.service.local', 'backend.internal', 'metadata.google.internal', '127.0.0.1', '[::1]']) {
      expect(isDisallowedHost(host)).toBe(true)
    }
    expect(isDisallowedHost('api.example.com')).toBe(false)
  })

  it('validates URLs and rejects private targets, credentials and non-http schemes', () => {
    expect(validateWebhookUrl('https://api.example.com/v1/webhook').valid).toBe(true)
    expect(validateWebhookUrl('http://127.0.0.1:8080/hook').valid).toBe(false)
    expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false)
    expect(validateWebhookUrl('https://admin:secret@api.example.com/webhook').valid).toBe(false)
    expect(validateWebhookUrl('ftp://example.com/data').valid).toBe(false)
    expect(validateWebhookUrl('not-a-url').valid).toBe(false)
  })

  it('rejects blocked literals before DNS lookup', async () => {
    const lookup = vi.fn(async () => [{ address: '8.8.8.8', family: 4 }])
    await expect(resolveSafeWebhookTarget('http://127.0.0.1/hook', lookup)).rejects.toThrow(/cannot point to internal or private/)
    await expect(resolveSafeWebhookTarget('http://localhost/hook', lookup)).rejects.toThrow(/cannot point to internal or private/)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('allows a public DNS answer and returns the address to pin', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    const target = await resolveSafeWebhookTarget('https://api.example.com/hook', lookup)
    expect(target.address).toBe('93.184.216.34')
    expect(target.family).toBe(4)
    expect(target.url.hostname).toBe('api.example.com')
    expect(lookup).toHaveBeenCalledWith('api.example.com')
  })

  it('rejects mixed public/private DNS answers', async () => {
    const lookup = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])
    await expect(resolveSafeWebhookTarget('https://api.example.com/hook', lookup)).rejects.toThrow(/disallowed address: 127\.0\.0\.1/)
  })

  it('fails closed when DNS fails or returns no addresses', async () => {
    await expect(resolveSafeWebhookTarget('https://api.example.com/hook', async () => { throw new Error('SERVFAIL') })).rejects.toThrow(/DNS resolution failed/)
    await expect(resolveSafeWebhookTarget('https://api.example.com/hook', async () => [])).rejects.toThrow(/no addresses returned/)
  })

  it('assertSafeWebhookUrl returns the validated URL', async () => {
    const url = await assertSafeWebhookUrl('http://127.0.0.1/hook').catch(() => null)
    expect(url).toBeNull()
  })
})



describe('Webhook request size and header validation', () => {
  it('enforces the UTF-8 body byte limit', () => {
    expect(validateWebhookRequest('x'.repeat(MAX_WEBHOOK_BODY_BYTES))).toBeNull()
    expect(
      validateWebhookRequest('x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1)),
    ).toMatch(/1 MiB limit/)
    expect(validateWebhookRequest('é'.repeat(MAX_WEBHOOK_BODY_BYTES / 2 + 1)))
      .toMatch(/1 MiB limit/)
  })

  it('limits header count and aggregate encoded size', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_WEBHOOK_HEADERS + 1 }, (_, i) => [`X-Test-${i}`, 'v']),
    )
    expect(validateWebhookRequest('{}', tooMany)).toMatch(/header limit/)

    const tooLarge = { 'X-Test': 'a'.repeat(MAX_WEBHOOK_HEADER_BYTES) }
    expect(validateWebhookRequest('{}', tooLarge)).toMatch(/byte limit/)
  })

  it('rejects invalid header names, control characters and HTTP framing headers', () => {
    expect(validateWebhookRequest('{}', { 'Bad Header': 'value' })).toMatch(/header name/)
    expect(validateWebhookRequest('{}', { 'X-Test': 'ok\r\nInjected: yes' })).toMatch(/control characters/)
    expect(validateWebhookRequest('{}', { 'X-Test': 'bad\u0000value' })).toMatch(/control characters/)
    expect(validateWebhookRequest('{}', { 'Content-Length': '2' })).toMatch(/not allowed/)
    expect(validateWebhookRequest('{}', { 'transfer-encoding': 'chunked' })).toMatch(/not allowed/)
  })

  it('rejects non-string bodies, non-object headers and non-string header values', () => {
    expect(validateWebhookRequest(123)).toMatch(/body must be a string/)
    expect(validateWebhookRequest('{}', ['bad'])).toMatch(/headers must be an object/)
    expect(validateWebhookRequest('{}', { 'X-Test': 123 })).toMatch(/string value/)
  })

  it('rejects invalid requests before DNS or network access', async () => {
    const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    await expect(
      postSafeWebhook('https://api.example.com/hook', 'x'.repeat(MAX_WEBHOOK_BODY_BYTES + 1), {}, 500, lookup),
    ).rejects.toThrow(/1 MiB limit/)
    await expect(
      postSafeWebhook('https://api.example.com/hook', '{}', { 'Content-Length': '2' }, 500, lookup),
    ).rejects.toThrow(/not allowed/)
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('postSafeWebhook request-level protections', () => {
  const publicLookup: DNSLookup = async () => [{ address: '93.184.216.34', family: 4 }]

  function mockResponse(statusCode: number) {
    return {
      statusCode,
      resume: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'end') callback()
        return undefined
      }),
    }
  }

  it('pins the connection to the resolved IP and preserves HTTPS hostname verification', async () => {
    const response = mockResponse(204)
    let capturedOptions: any
    let capturedRequest: any
    const spy = vi.spyOn(https, 'request').mockImplementation(((options: any, callback: (res: any) => void) => {
      capturedOptions = options
      capturedRequest = {
        on: vi.fn().mockReturnThis(),
        setTimeout: vi.fn(),
        end: vi.fn(() => callback(response)),
        destroy: vi.fn().mockReturnThis(),
      }
      return capturedRequest
    }) as unknown as typeof https.request)

    try {
      const result = await postSafeWebhook('https://api.example.com/hook?x=1', '{"ok":true}',
        { 'content-type': 'application/json', Host: 'attacker.invalid' }, 500, publicLookup)
      expect(result).toEqual({ status: 204, ok: true })
      expect(capturedOptions.hostname).toBe('93.184.216.34')
      expect(capturedOptions.servername).toBe('api.example.com')
      expect(capturedOptions.rejectUnauthorized).toBe(true)
      expect(capturedOptions.headers.Host).toBe('api.example.com')
      expect(capturedOptions.path).toBe('/hook?x=1')
      expect(capturedRequest.end).toHaveBeenCalledWith('{"ok":true}')
    } finally {
      spy.mockRestore()
    }
  })

  it('does not follow redirects and treats a 302 as a non-success response', async () => {
    const response = mockResponse(302)
    const spy = vi.spyOn(http, 'request').mockImplementation(((options: any, callback: (res: any) => void) => ({
      on: vi.fn().mockReturnThis(),
      setTimeout: vi.fn(),
      end: vi.fn(() => callback(response)),
      destroy: vi.fn().mockReturnThis(),
    })) as unknown as typeof http.request)
    try {
      const result = await postSafeWebhook('http://api.example.com/hook', '{}', {}, 500, publicLookup)
      expect(result).toEqual({ status: 302, ok: false })
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('enforces the overall deadline during DNS and never starts a late request', async () => {
    const lookup: DNSLookup = () => new Promise(() => {})
    const spy = vi.spyOn(https, 'request')
    await expect(postSafeWebhook('https://api.example.com/hook', '{}', {}, 15, lookup))
      .rejects.toThrow(/timed out/i)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('destroys a stalled request when the overall deadline expires', async () => {
    let errorHandler: ((error: Error) => void) | undefined
    let request: any
    const destroy = vi.fn((error?: Error) => {
      if (error) errorHandler?.(error)
      return request
    })
    request = {
      on: vi.fn((event: string, callback: (error: Error) => void) => {
        if (event === 'error') errorHandler = callback
        return request
      }),
      setTimeout: vi.fn(),
      end: vi.fn(),
      destroy,
    }
    const spy = vi.spyOn(https, 'request').mockImplementation(((() => request) as unknown) as typeof https.request)
    try {
      await expect(postSafeWebhook('https://api.example.com/hook', '{}', {}, 15, publicLookup))
        .rejects.toThrow(/timed out/i)
      expect(destroy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})


describe('SSRF Protection - additional IPv6 special-use ranges', () => {
  it('blocks hexadecimal IPv4-mapped private addresses and IPv6 transition/documentation ranges', () => {
    for (const ip of [
      '::ffff:7f00:1',
      '::ffff:a00:1',
      '::ffff:c0a8:101',
      '2001::1',
      '2001:db8::1',
      '2002:7f00:1::1',
      '3fff::1',
      '64:ff9b::7f00:1',
            '2001:2::1',
      '2001:20::1',
      '2001:30::1',
      '5f00::1',
      '4000::1',
    ]) {
      expect(isPrivateOrReservedIP(ip), ip).toBe(true)
    }
  })

  it('continues to allow representative public IPv6 global-unicast addresses', () => {
    expect(isPrivateOrReservedIP('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateOrReservedIP('2001:4860:4860::8888')).toBe(false)
        expect(isPrivateOrReservedIP('2620:4f:8000::1')).toBe(false)
  })
})
