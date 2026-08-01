# Paberin Chat Dataset Pipeline & Evaluator

Turn the raw WhatsApp chat-history zips into an Agnes-generated dataset for
testing and improving the Paberin AI chat assistant (`/api/chat`).

## Files

| File | Purpose |
|------|---------|
| `scripts/build-chat-dataset.py` | Pipeline: extract → parse → segment → Agnes understand (PASS 1) → ideal responses (PASS 2) → dataset |
| `scripts/evaluate-dataset.js`   | Run the dataset against a running `/api/chat` assistant (objective checks + optional Agnes judge) |
| `scripts/dev-fetch-patch.cjs`  | Dev-only sandbox workaround (undici cannot reach external hosts in this workspace's shell; patches `global.fetch` via `NODE_OPTIONS=--require`). Not used in production. |
| `tests/datasets/paberin_chat_eval_dataset.json` | Final dataset: `meta` + `test_cases[]` |
| `tests/datasets/paberin_chat_analyses.json` | Per-chat understanding: summaries, services, prices, issues, missed opportunities |
| `tests/datasets/checkpoints/` | JSONL checkpoints (gitignored) — reruns resume and retry failures |
| `scripts/data/chats/` | Extracted chat transcripts (gitignored) |

## Pipeline stages

1. **EXTRACT** — unzips only `*.txt` from the chat-history zips (texts only;
   media is never touched). Idempotent.
2. **PARSE** — local WhatsApp-export parser (no AI): handles the U+202F
   narrow no-break space in timestamps, multi-line messages, sender-side
   detection (`[SHOP]` = Paberin/Skyal side, `[CUST]` = customer), media
   placeholders → compact markers, system notices dropped.
3. **SEGMENT** — splits chats into ≤ `SEGMENT_CHARS` (default 6000) bounded
   segments, preferring cuts at ≥2h gaps. The old pipeline truncated at
   30K chars and silently dropped everything after — the corpus here has
   chats up to 2.7M chars.
4. **PASS 1** — Agnes 2.0 Flash reads each segment and returns JSON:
   `segment_summary` (what happened, services, prices, customer issues,
   missed sales opportunities) + every customer inquiry with exact
   customer messages, intent, `expected_behavior` (quote|clarify|redirect|
   confirm), missing info, what Paberin quoted, outcome.
5. **PASS 2** — for each inquiry, Agnes writes the IDEAL assistant reply
   using the **live** `PABERIN_SYSTEM_PROMPT` extracted from
   `src/lib/chat.ts`, so ideal responses follow the exact instructions the
   deployed assistant uses (no price drift).
6. **FINALIZE** — merges checkpoints into the dataset + analyses JSON.

## Usage

```bash
# Load the API key (reads .env.local automatically)
python3 scripts/build-chat-dataset.py            # run everything
STAGE=pass1 python3 scripts/build-chat-dataset.py # dataset without ideal responses
STAGE=finalize python3 scripts/build-chat-dataset.py # rebuild JSONs from checkpoints

# Env knobs: MAX_CHATS, MAX_SEGMENTS, SEGMENT_CHARS, CONCURRENCY, DRY_RUN,
# STAGE (extract|parse|pass1|pass2|finalize|all), CHAT_ZIPS_DIR

# Evaluate the assistant against the dataset (needs `next dev` running):
NODE_OPTIONS="--require ./scripts/dev-fetch-patch.cjs" \
  node scripts/evaluate-dataset.js --limit 50 --judge --server http://localhost:3000
```

## Reliability notes (learned the hard way)

- The Agnes API caches empty/failed responses keyed on the exact prompt:
  identical retries return the cached failure instantly. `call_agnes`
  therefore retries with a perturbed prompt suffix, and the checkpoint
  mechanism retries failures across runs (up to 3 attempts each).
- The API truncates long outputs (returns `finish_reason=length`, sometimes
  empty). `parse_json_any` salvages complete inquiry objects from truncated
  JSON, and segment size is kept small enough that outputs usually fit.
- Per-IP rate limiting: use `CONCURRENCY` ~6–14; 429s are retried with
  jittered backoff.
