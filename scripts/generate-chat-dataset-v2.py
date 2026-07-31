#!/usr/bin/env python3
"""
Paberin Chat Dataset Generator v2.0 — AI-Powered Pipeline
==========================================================
Uses Agnes 2.0 Flash (512K context window, tool calling) to:
  PASS 1: Read each entire WhatsApp chat and extract all customer inquiries
          with their full context, prices quoted, and outcomes.
  PASS 2: For each inquiry, generate the "ideal" assistant response that
          the Paberin AI should produce.

This is superior to regex because:
  - Chats are unstructured, multi-turn, use Nigerian pidgin, abbreviations
  - Agnes understands context across dozens of messages
  - Extracts implicit pricing, quantities, materials from natural language
  - Handles media references, voice notes, and mixed languages

Output: tests/datasets/paberin_chat_eval_dataset.json
"""

import os
import json
import time
import hashlib
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ─── Configuration ───────────────────────────────────────────────────
WHATSAPP_DIR = "/tmp/paberin_chats/all"
OUTPUT_DIR = Path("/home/doombuggy_/Projects/paberin/tests/datasets")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

AGNES_API_KEY = os.environ.get("AGNES_API_KEY", "")
AGNES_API_URL = "https://apihub.agnes-ai.com/v1/chat/completions"
MODEL = "agnes-2.0-flash"

# Limits
MAX_CHARS_PER_CHAT = 30000  # Truncate very long chats to fit in one request
MAX_CHATS = int(os.environ.get("MAX_CHATS", "0")) or None  # 0 = all
DELAY_BETWEEN_CALLS = float(os.environ.get("DELAY_MS", "1000")) / 1000.0


# ─── Agnes API Helper ────────────────────────────────────────────────
def call_agnes(system_prompt: str, user_content: str,
               temperature: float = 0.3, max_tokens: int = 4096,
               retries: int = 3) -> dict | None:
    """Call Agnes 2.0 Flash and return parsed JSON response."""
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                AGNES_API_URL,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {AGNES_API_KEY}",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode())
                content = data["choices"][0]["message"]["content"]
                return _parse_json_response(content)

        except (urllib.error.URLError, json.JSONDecodeError, KeyError,
                ConnectionError, TimeoutError) as e:
            if attempt < retries - 1:
                wait = (2 ** attempt) * 1.0
                time.sleep(wait)
            else:
                print(f"  [WARN] Agnes call failed: {type(e).__name__}: {e}")
                return None


def _parse_json_response(content: str) -> dict | None:
    """Extract JSON from Agnes response, handling markdown code blocks."""
    content = content.strip()
    # Remove markdown code fences
    if content.startswith("```"):
        lines = content.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        content = "\n".join(lines)

    # Try direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to find JSON object in the text
    import re
    match = re.search(r'\{[\s\S]*\}', content)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


# ═══════════════════════════════════════════════════════════════════════
# PASS 1: Extract structured inquiries from each chat
# ═══════════════════════════════════════════════════════════════════════

PASS1_SYSTEM_PROMPT = """You are a data extraction specialist analyzing WhatsApp chat logs between Paberin Creations (a Lagos-based laser cutting business) and its customers.

Paberin services:
- Laser cutting: fabric (aso oke, ankara, lace, cotton, linen, velvet), leather, wood/MDF, acrylic
- Products: garment cutting, cake toppers, signage, tags/labels, phone engraving, jewelry engraving
- Pricing in Nigerian Naira (₦): fabric cutting ₦5K-₦75K, tags ₦500-₦2K/piece, toppers ₦5K-₦15K, metal cutting ₦70K+
- Delivery: pickup (free), Lagos delivery ₦1,500-₦3,000, nationwide ₦3,500
- Payment: full payment before production, no VAT

Your job: Read the ENTIRE chat transcript and extract ALL customer inquiries about products, pricing, orders, materials, delivery, or any business transaction.

For each distinct customer inquiry found, extract:
{
  "inquiry_id": "unique_short_id",
  "customer_name": "name from chat title or messages",
  "date_range": "approximate date range of this inquiry",
  "customer_messages": ["the exact customer message(s) belonging to this inquiry"],
  "context_summary": "1-2 sentence summary of what was discussed before this inquiry",
  "intent": "quote_request|order_placement|material_inquiry|delivery_inquiry|lead_time|design_inquiry|general_info|other",
  "what_customer_wants": "clear description of what the customer is asking for",
  "key_details": {
    "service_type": "fabric_cutting|leather_tags|acrylic_topper|wood_engraving|metal_cutting|phone_engraving|jewelry_engraving|cake_topper|other|null",
    "material": "fabric|leather|wood|acrylic|metal|other|null",
    "quantity_mentioned": number_or_null,
    "sla_mentioned": "Standard|Express|null",
    "delivery_mentioned": "pickup|local_delivery|nationwide|null"
  },
  "what_paberin_quoted": {
    "price_quoted": number_or_null,
    "price_text": "the exact price text from Paberin's response",
    "lead_time_quoted": "text or null",
    "was_order_placed": true_or_false
  },
  "outcome": "order_placed|quote_given_only|no_response|follow_up_needed|declined|other",
  "conversation_quality_note": "any issues like slow response, unclear pricing, etc."
}

IMPORTANT:
- Group related messages into ONE inquiry (e.g., if customer asks about price, then clarifies size, then asks about delivery — that's ONE inquiry)
- A single chat file may contain MULTIPLE distinct inquiries (different dates, different products)
- Include the EXACT customer messages (not paraphrased)
- If Paberin quoted a price, extract the exact price and what it was for
- Be thorough — don't miss inquiries buried in casual conversation
- Return ONLY valid JSON (no markdown, no extra text). The JSON must be: {"inquiries": [...]}"""


def pass1_extract_inquiries(chat_text: str, filename: str) -> list[dict]:
    """Send an entire chat to Agnes to extract structured inquiries."""
    # Truncate if needed (512K context is huge, but we stay reasonable)
    if len(chat_text) > MAX_CHARS_PER_CHAT:
        chat_text = chat_text[:MAX_CHARS_PER_CHAT] + "\n[... chat truncated ...]"

    user_content = f"""Chat file: {filename}

--- CHAT TRANSCRIPT ---
{chat_text}
--- END TRANSCRIPT ---

Extract ALL customer inquiries from this chat as a JSON object with an "inquiries" array."""

    result = call_agnes(PASS1_SYSTEM_PROMPT, user_content,
                        temperature=0.2, max_tokens=4096)
    if result and "inquiries" in result:
        return result["inquiries"]
    return []


# ═══════════════════════════════════════════════════════════════════════
# PASS 2: Generate ideal assistant responses for each inquiry
# ═══════════════════════════════════════════════════════════════════════

PASS2_SYSTEM_PROMPT = """You are simulating the PERFECT Paberin Creations AI assistant. Paberin is a laser cutting business in Ogba, Ikeja, Lagos, Nigeria.

SERVICES & PRICING (Nigerian Naira ₦, NO VAT):
FABRIC LASER CUTTING (customer brings fabric):
- Sleeves (pair): ₦20,000 | 5 working days | Express 48h (+50%)
- Full Buba: ₦35,000 | 5 working days | Express 48h (+50%)
- Bottom of Wrapper: ₦40,000 | 5 working days
- Skirt: ₦50,000
- Full Blouse + Full Skirt: ₦70,000
- Full Buba + Full Wrapper: ₦75,000
- Boubou: ₦45,000
- Sleeves + Edge of Wrapper: ₦50,000
- Sleeves + Buba Front/Back: ₦30,000
- Custom Fabric Cutting: ₦10,000/section, min ₦20,000
- Per Yard: ₦20,000/yard
- Complex Custom Gown: ₦100,000-₦200,000 | 1-2 weeks | NO EXPRESS

ENGRAVING (customer brings item, NO EXPRESS, minimum 48 hours):
- Phone Back: ₦5,000 per phone
- Jewelry: ₦6,000 per piece (₦5K-₦7K range)
- Leather: ₦17,500 per piece (₦15K-₦20K range)
- Wood: ₦7,500 per piece (₦5K-₦10K range)
- Small Items (stirrers, sticks): ₦1,500 per piece (₦1K-₦2K)
- Curved Surface: ₦15,000 per piece
- Detective Badge: ₦2,500 per piece | NO EXPRESS (needs consultation)
- Necklace: ₦7,000 per piece

SHEET CUTTING:
- 4ft×4ft: ₦40,000 | 2-3 days | Express 48h (+50%)
- 8ft×4ft: ₦70,000 | 3-5 days | NO EXPRESS (external partner)
- Custom Sheet: ₦55,000 | 2-3 days | Express 48h (+50%)
- Acrylic Stick Cutting: ₦100/piece, min ₦5,000

CAKE TOPPERS:
- Acrylic Topper: ₦15,000 | 5 days | Express 48h (+50%)
- Custom Topper: ₦25,000 | 5-7 days | NO EXPRESS

ADD-ONS: Stoning Board ₦20,000

RULES:
- Express = +50% surcharge, minimum 48 hours (NOT next day)
- Engraving: NO express. We don't rush engraving.
- Metal cutting: ALWAYS external partner, 10 working days, NO express
- NO "wait and get" service
- Lead time from PAYMENT confirmation
- Full payment before production
- NO VAT
- First-time discount: one-time only, manually applied
- Machine bed: 900mm × 600mm in-house, 4ft×8ft external

DELIVERY:
- Pickup from Ogba, Ikeja, Lagos (free)
- Local Lagos delivery: ₦1,500-₦3,000
- Nationwide waybill: ₦3,500

VOICE & TONE:
- Warm, professional, Nigerian-friendly
- Use "ma" or "sir" respectfully
- Be honest about limitations (don't overpromise)
- When you can't do something, explain why and suggest alternatives
- Always ask clarifying questions when details are missing
- Quote specific prices in ₦ when possible

For the customer inquiry below, write the PERFECT assistant response.
Return ONLY valid JSON: {"ideal_response": "your full response text here"}"""


def pass2_generate_ideal_response(inquiry: dict) -> str | None:
    """Generate the ideal assistant response for a customer inquiry."""
    customer_msgs = inquiry.get("customer_messages", [])
    if isinstance(customer_msgs, list):
        combined = "\n".join(f'- "{msg}"' for msg in customer_msgs)
    else:
        combined = str(customer_msgs)

    what_they_want = inquiry.get("what_customer_wants", "Unknown")
    context = inquiry.get("context_summary", "")

    user_content = f"""Context: {context}

What the customer wants: {what_they_want}

Customer message(s):
{combined}

Intent: {inquiry.get('intent', 'unknown')}
Key details: {json.dumps(inquiry.get('key_details', {}))}
What Paberin actually quoted: {json.dumps(inquiry.get('what_paberin_quoted', {}))}

Write the PERFECT assistant response. Be specific about prices if relevant. Return as JSON."""

    result = call_agnes(PASS2_SYSTEM_PROMPT, user_content,
                        temperature=0.4, max_tokens=2048)
    if result and "ideal_response" in result:
        return result["ideal_response"]
    return None


# ═══════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════

def main():
    print("=" * 70)
    print("PABERIN CHAT DATASET GENERATOR v2.0 — AI-Powered Pipeline")
    print("=" * 70)

    if not AGNES_API_KEY:
        print("ERROR: AGNES_API_KEY environment variable not set.")
        print("Set it with: export AGNES_API_KEY='sk-...'")
        return

    # ── Load chat files ──
    txt_files = sorted(Path(WHATSAPP_DIR).glob("*.txt"))
    if MAX_CHATS:
        txt_files = txt_files[:MAX_CHATS]
    print(f"\n📁 Found {len(txt_files)} chat files to process")

    # ── PASS 1: Extract inquiries from each chat ──
    print("\n" + "=" * 70)
    print("PASS 1: Extracting structured inquiries from each chat via Agnes AI")
    print("=" * 70)

    all_inquiries = []
    stats = {"chats_processed": 0, "total_inquiries": 0, "chats_with_errors": 0}

    for i, fp in enumerate(txt_files):
        filename = fp.name
        print(f"\n[{i+1}/{len(txt_files)}] {filename[:60]}...")

        try:
            with open(fp, 'r', encoding='utf-8') as f:
                chat_text = f.read()
        except UnicodeDecodeError:
            try:
                with open(fp, 'r', encoding='latin-1') as f:
                    chat_text = f.read()
            except Exception:
                print(f"  ⚠️  Could not read file, skipping")
                continue

        inquiries = pass1_extract_inquiries(chat_text, filename)

        if inquiries:
            # Tag each inquiry with its source file
            for inq in inquiries:
                inq["source_file"] = filename
                inq["id"] = hashlib.md5(
                    (filename + str(inq.get("customer_messages", ""))).encode()
                ).hexdigest()[:12]

            all_inquiries.extend(inquiries)
            stats["total_inquiries"] += len(inquiries)
            print(f"  ✅ Extracted {len(inquiries)} inquiries")
        else:
            stats["chats_with_errors"] += 1
            print(f"  ⚠️  No inquiries extracted (may be empty or error)")

        stats["chats_processed"] += 1
        time.sleep(DELAY_BETWEEN_CALLS)

    print(f"\n📊 PASS 1 Summary: {stats['total_inquiries']} inquiries from "
          f"{stats['chats_processed']} chats ({stats['chats_with_errors']} with errors)")

    # Save intermediate results
    pass1_path = OUTPUT_DIR / "paberin_inquiries_pass1.json"
    with open(pass1_path, 'w', encoding='utf-8') as f:
        json.dump({
            "meta": {
                "generated_at": datetime.now().isoformat(),
                "pipeline_version": "2.0",
                "pass": 1,
                "total_inquiries": len(all_inquiries),
                "stats": stats,
            },
            "inquiries": all_inquiries,
        }, f, ensure_ascii=False, indent=2)
    print(f"💾 Pass 1 results saved to: {pass1_path}")

    # ── PASS 2: Generate ideal responses for each inquiry ──
    print("\n" + "=" * 70)
    print("PASS 2: Generating ideal assistant responses via Agnes AI")
    print("=" * 70)

    intent_counts = defaultdict(int)
    augmented = []

    for i, inquiry in enumerate(all_inquiries):
        if i % 5 == 0:
            print(f"  Progress: {i}/{len(all_inquiries)}")

        intent = inquiry.get("intent", "other")
        intent_counts[intent] += 1

        ideal_response = pass2_generate_ideal_response(inquiry)

        entry = {
            "id": inquiry.get("id", f"inq_{i:04d}"),
            "source_file": inquiry.get("source_file", ""),
            "customer_messages": inquiry.get("customer_messages", []),
            "context_summary": inquiry.get("context_summary", ""),
            "what_customer_wants": inquiry.get("what_customer_wants", ""),
            "intent": intent,
            "key_details": inquiry.get("key_details", {}),
            "what_paberin_quoted": inquiry.get("what_paberin_quoted", {}),
            "actual_outcome": inquiry.get("outcome", "unknown"),
            "ideal_response": ideal_response,
            "conversation_quality_note": inquiry.get("conversation_quality_note", ""),
        }
        augmented.append(entry)
        time.sleep(DELAY_BETWEEN_CALLS)

    # ── Save final dataset ──
    print("\n" + "=" * 70)
    print("SAVING FINAL DATASET")
    print("=" * 70)

    ideal_count = sum(1 for e in augmented if e.get("ideal_response"))

    final_dataset = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "pipeline_version": "2.0",
            "model_used": MODEL,
            "total_cases": len(augmented),
            "with_ideal_responses": ideal_count,
            "intent_distribution": dict(intent_counts),
            "source": "WhatsApp chat exports analyzed by Agnes 2.0 Flash",
            "brand": "Paberin",
            "pricing_note": "All amounts in ₦ Naira. NO VAT. Full payment before production.",
            "service_catalog_version": "June 2026",
        },
        "test_cases": augmented,
    }

    final_path = OUTPUT_DIR / "paberin_chat_eval_dataset.json"
    with open(final_path, 'w', encoding='utf-8') as f:
        json.dump(final_dataset, f, ensure_ascii=False, indent=2)

    print(f"💾 Final dataset: {final_path}")
    print(f"📏 Size: {final_path.stat().st_size / 1024:.1f} KB")
    print(f"📊 {len(augmented)} test cases ({ideal_count} with ideal responses)")

    # Intent distribution
    print("\n📊 Intent distribution:")
    for intent, count in sorted(intent_counts.items(), key=lambda x: -x[1]):
        bar = "█" * min(count, 40)
        print(f"  {intent:25s} {count:4d}  {bar}")

    print("\n✅ Done! Dataset ready for chat evaluation.")
    print(f"   Next: pnpm run test -- tests/unit/chat.test.ts")


if __name__ == '__main__':
    main()
