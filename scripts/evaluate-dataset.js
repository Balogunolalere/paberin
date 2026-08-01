#!/usr/bin/env node
/**
 * Paberin Dataset Evaluator — evaluate the /api/chat assistant against the
 * real-customer dataset built by scripts/build-chat-dataset.py.
 *
 * For each test case it:
 *   1. Sends the customer's actual message(s) to the running assistant.
 *   2. Runs objective checks (no AI): responded, quoted when expected,
 *      price present, no media leakage, sane price magnitude.
 *   3. Optionally asks Agnes (--judge) to grade the assistant reply against
 *      the ideal response: helpfulness, price accuracy, tone, policy, verdict.
 *   4. Writes a report JSON to tests/datasets/eval_report_<ts>.json.
 *
 * Usage:
 *   node scripts/evaluate-dataset.js [--limit 20] [--judge] [--server http://localhost:3000]
 *   node scripts/evaluate-dataset.js --limit 10            # objective checks only
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATASET = path.join(ROOT, 'tests', 'datasets', 'paberin_chat_eval_dataset.json')

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const LIMIT = parseInt(getArg('--limit', '0'), 10) || 0 // 0 = all
const SERVER = getArg('--server', 'http://localhost:3000')
const USE_JUDGE = args.includes('--judge')
const API_URL = `${SERVER}/api/chat`

// ── Agnes judge config (key from env or .env.local) ────────────────────
function loadEnv() {
  const env = { ...process.env }
  const envFile = path.join(ROOT, '.env.local')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim()
    }
  }
  return env
}
const env = loadEnv()
const AGNES_KEY = env.AGNES_API_KEY || ''
const AGNES_URL = 'https://apihub.agnes-ai.com/v1/chat/completions'

// ── Helpers ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callAgnes(system, user, maxTokens = 1500) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(AGNES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGNES_KEY}` },
        body: JSON.stringify({
          model: 'agnes-2.0-flash',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.choices?.[0]?.message?.content || ''
    } catch (e) {
      if (attempt === 2) return ''
      await sleep(1000 * 2 ** attempt)
    }
  }
  return ''
}

function parseJSON(text) {
  let t = (text || '').trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(t) } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { /* ignore */ }
  }
  return null
}

async function sendChat(message) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: [], brand: 'paberin', mode: 'live' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { error: body.message || `HTTP ${res.status}`, status: res.status }
  }
  return res.json()
}

function customerInput(tc) {
  const text = (tc.customer_query_text || '').trim()
  if (text) return text
  return (tc.customer_messages || []).filter((m) => typeof m === 'string' && m.trim()).join('\n').trim()
}

// ── Objective checks (no AI) ────────────────────────────────────────────
function objectiveChecks(tc, res) {
  const ideal = tc.ideal_response || ''
  const text = (res.assistant_text || '').trim()
  const checks = {
    responded: text.length > 0,
    not_too_short: text.length >= 20,
    not_too_long: text.length <= 4000,
    price_when_ideal_has_price: !/₦/.test(ideal) || /₦/.test(text),
    quote_when_expected: tc.expected_behavior !== 'quote' || !!res.quote,
    quote_price_sane: !res.quote || (res.quote.price > 0 && res.quote.price < 50_000_000),
    no_media_leak: !/\[media|<\s*media|omitted/i.test(text),
  }
  const passed = Object.values(checks).every(Boolean)
  return { checks, passed, failures: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k) }
}

// ── Agnes judge ─────────────────────────────────────────────────────────
const JUDGE_SYSTEM = `You are grading Paberin's AI assistant on a real customer inquiry.

Compare the ASSISTANT REPLY against the IDEAL REPLY (both given). Grade on:
- helpfulness (does it answer what the customer asked? asks clarifying questions when details are missing?)
- price_accuracy (are quoted prices consistent with the ideal reply / Paberin's catalog? no invented prices?)
- tone (warm, Nigerian-friendly, uses "ma"/"sir", professional)
- policy_adherence (express = +50% & 48h min, no express for engraving/metal, full payment before production, lead time from payment, pickup Ogba Ikeja Lagos free)

Return ONLY valid JSON:
{"helpfulness": 1-10, "price_accuracy": 1-10, "tone": 1-10, "policy_adherence": 1-10, "verdict": "pass"|"fail", "reason": "one sentence"}`

async function judgeReply(tc, res) {
  const user = `Customer message(s):\n${customerInput(tc)}\n\nWhat the customer wants: ${tc.what_customer_wants || ''}\nIntent: ${tc.intent}\nExpected behavior: ${tc.expected_behavior}\n\nIDEAL REPLY:\n${tc.ideal_response || '(none)'}\n\nASSISTANT REPLY:\n${res.assistant_text || '(empty)'}`
  const out = await callAgnes(JUDGE_SYSTEM, user, 700)
  const parsed = parseJSON(out)
  if (!parsed) return { error: 'judge parse failed', raw: out.slice(0, 200) }
  return parsed
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(DATASET)) {
    console.error(`Dataset not found: ${DATASET}\nRun scripts/build-chat-dataset.py first.`)
    process.exit(1)
  }
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'))
  const cases = (LIMIT ? dataset.test_cases.slice(0, LIMIT) : dataset.test_cases).filter((c) => customerInput(c))
  console.log(`\n📊 Evaluating ${cases.length}/${dataset.test_cases.length} cases against ${API_URL}${USE_JUDGE ? ' (with Agnes judge)' : ''}\n`)

  const results = []
  let pass = 0
  let fail = 0
  let errors = 0

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i]
    const input = customerInput(tc)
    const res = await sendChat(input)
    if (res.error) {
      errors++
      results.push({ id: tc.id, intent: tc.intent, error: res.error })
      console.log(`  [${i + 1}/${cases.length}] ❌ ${tc.id} — ${res.error}`)
      continue
    }
    const obj = objectiveChecks(tc, res)
    let judge = null
    if (USE_JUDGE) {
      judge = await judgeReply(tc, res)
      await sleep(150)
    }
    const finalPass = obj.passed && (!USE_JUDGE || judge?.verdict === 'pass')
    if (finalPass) pass++
    else fail++
    results.push({
      id: tc.id,
      source_file: tc.source_file,
      intent: tc.intent,
      expected_behavior: tc.expected_behavior,
      objective: obj,
      assistant_text: res.assistant_text?.slice(0, 500),
      quote: res.quote || null,
      judge,
    })
    const judgeLine = USE_JUDGE ? ` | judge: ${judge?.verdict || 'n/a'} (${judge?.helpfulness ?? '?'}/10)` : ''
    const flag = obj.passed ? '✅' : '⚠️'
    console.log(`  [${i + 1}/${cases.length}] ${flag} ${tc.id} [${tc.intent}/${tc.expected_behavior}]${obj.passed ? '' : ' — ' + obj.failures.join(', ')}${judgeLine}`)
    await sleep(120) // be gentle with the local rate limiter (100/min/IP)
  }

  // ── Report ─────────────────────────────────────────────────────────────
  const byIntent = {}
  for (const r of results) {
    if (!r.intent) continue
    byIntent[r.intent] = byIntent[r.intent] || { total: 0, passed: 0 }
    byIntent[r.intent].total++
    if (!r.error && r.objective?.passed && (!USE_JUDGE || r.judge?.verdict === 'pass')) byIntent[r.intent].passed++
  }

  const report = {
    generated_at: new Date().toISOString(),
    server: API_URL,
    judge_enabled: USE_JUDGE,
    total: results.length,
    passed: pass,
    failed: fail,
    errors,
    pass_rate: results.length ? Math.round((pass / results.length) * 100) : 0,
    by_intent: byIntent,
    results,
  }
  const outPath = path.join(ROOT, 'tests', 'datasets', `eval_report_${Date.now()}.json`)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\n📈 Pass rate: ${report.pass_rate}% (${pass}/${results.length}${USE_JUDGE ? ' incl. judge verdict' : ''}), ${errors} errors`)
  console.log(`💾 Report: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
