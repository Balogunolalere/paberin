/**
 * Dev-only sandbox workaround: in this workspace's sandboxed shell, undici
 * (global fetch) cannot establish external connections while node's own
 * http/https modules can. This preload patches globalThis.fetch for
 * NON-localhost targets using node's http/https modules, so the Next dev
 * server and evaluation scripts can reach the Agnes API from this sandbox.
 *
 * Load with: NODE_OPTIONS="--require ./scripts/dev-fetch-patch.cjs"
 * It is NOT used in production and does not change any shipped code.
 */
const http = require('http')
const https = require('https')
const { URL } = require('url')

if (!process.env.DEV_FETCH_PATCH_LOADED) {
  process.env.DEV_FETCH_PATCH_LOADED = '1'
  const originalFetch = globalThis.fetch
  globalThis.fetch = (url, opts = {}) => {
    const target = new URL(url)
    // Only patch external targets; keep undici for localhost (works fine)
    if (target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '::1') {
      return originalFetch(url, opts)
    }
    const lib = target.protocol === 'https:' ? https : http
    const method = opts.method || 'GET'
    const body = opts.body != null ? Buffer.from(opts.body) : null
    const headers = { ...(opts.headers || {}) }
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    if (body && !headers['Content-Length']) headers['Content-Length'] = body.length
    const timeoutMs = opts.signal && opts.signal.timeoutMs ? opts.signal.timeoutMs : 120000
    return new Promise((resolve, reject) => {
      const req = lib.request(
        target,
        { method, headers, timeout: timeoutMs },
        (res) => {
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            resolve(new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
            }))
          })
        }
      )
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('fetch timeout')))
      if (body) req.write(body)
      req.end()
    })
  }
  console.log('[dev-fetch-patch] patched global fetch for external hosts')
}
