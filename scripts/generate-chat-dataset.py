#!/usr/bin/env python3
"""
Paberin Chat Dataset Generator v1.0
====================================
Extracts customer messages from WhatsApp chat exports, deduplicates,
classifies by intent, and calls Agnes 2.0 Flash to generate:
  - Ideal assistant responses
  - Expected price quotes
  - Intent classifications

Output: A structured JSON dataset for evaluating the Paberin chat AI.
"""

import os
import re
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

AGNES_API_KEY = os.environ.get("AGNES_API_KEY", "sk-lgKKJlFUbZ56jRAQoXBCvYDlx66hOXv4AndXGVvpL3l2cYd3")
AGNES_API_URL = "https://apihub.agnes-ai.com/v1/chat/completions"

# How many messages to send to Agnes for augmentation (0 = all)
MAX_AUGMENT = int(os.environ.get("MAX_AUGMENT", "200"))
# Delay between Agnes calls to avoid rate limits
DELAY_MS = int(os.environ.get("DELAY_MS", "500"))

# Paberin brand names in WhatsApp exports
PABERIN_NAMES = {
    "paberin creations", "paberin", "skyallaser", "skyal laser",
    "skyal laser services", "skyal", "paberin. creations",
    "paberin admin", "admin paberin", "paberin client",
}

# ─── WhatsApp Line Parser ────────────────────────────────────────────
# Format: "M/D/YY, H:MM AM/PM - Sender Name: message text"
# Note: The space before AM/PM is a thin non-breaking space (U+202F) or regular space
WA_LINE_RE = re.compile(
    r'^(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}[\u202F\s]?[AP]M)\s*-\s*(.+?):\s*(.*)$'
)

SYSTEM_MSG_RE = re.compile(
    r'Messages and calls are end-to-end encrypted|'
    r'changed the subject|'
    r'added |removed |left|changed this group'
)

MEDIA_PLACEHOLDER = re.compile(r'<Media omitted>|file attached|\.jpg|\.png|\.pdf|sticker omitted', re.IGNORECASE)


def is_paberin_sender(sender: str) -> bool:
    """Check if the sender is Paberin (the business)."""
    lower = sender.lower().strip()
    for name in PABERIN_NAMES:
        if name in lower:
            return True
    return False


def is_system_message(line: str) -> bool:
    """Check if the line is a system/meta message."""
    return bool(SYSTEM_MSG_RE.search(line))


def is_media_only(content: str) -> bool:
    """Check if message is just media with no text substance."""
    cleaned = MEDIA_PLACEHOLDER.sub('', content).strip()
    return len(cleaned) < 10


def clean_message(content: str) -> str:
    """Clean a message: remove media placeholders, extra whitespace."""
    content = MEDIA_PLACEHOLDER.sub('', content)
    # Collapse whitespace
    content = re.sub(r'\s+', ' ', content).strip()
    return content


def parse_chat_file(filepath: str) -> list[dict]:
    """
    Parse a WhatsApp chat export .txt file.
    Returns list of messages: [{role, sender, content, timestamp}]
    """
    messages = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except UnicodeDecodeError:
        try:
            with open(filepath, 'r', encoding='latin-1') as f:
                lines = f.readlines()
        except Exception:
            return messages

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n\r')
        match = WA_LINE_RE.match(line)
        if match:
            date_str, time_str, sender, content = match.groups()
            sender = sender.strip()
            content = content.strip()

            # Handle multi-line messages (continuation lines don't start with date pattern)
            i += 1
            while i < len(lines):
                next_line = lines[i].rstrip('\n\r')
                if WA_LINE_RE.match(next_line) or not next_line.strip():
                    break
                content += ' ' + next_line.strip()
                i += 1

            if is_system_message(content):
                continue

            messages.append({
                'role': 'business' if is_paberin_sender(sender) else 'customer',
                'sender': sender,
                'content': content,
                'timestamp': f"{date_str}, {time_str}",
                'file': os.path.basename(filepath),
            })
        else:
            i += 1

    return messages


def extract_customer_messages(messages: list[dict]) -> list[dict]:
    """Extract only customer messages that have substance."""
    customer_msgs = []
    for msg in messages:
        if msg['role'] != 'customer':
            continue
        content = clean_message(msg['content'])
        if is_media_only(msg['content']):
            continue
        if len(content) < 15:
            continue
        customer_msgs.append({**msg, 'content': content})
    return customer_msgs


def deduplicate(messages: list[dict]) -> list[dict]:
    """Remove near-duplicate messages using content hash."""
    seen = set()
    unique = []
    for msg in messages:
        # Normalize for dedup
        key = re.sub(r'[^a-z0-9\s]', '', msg['content'].lower())
        key = re.sub(r'\s+', ' ', key).strip()
        h = hashlib.md5(key.encode()).hexdigest()
        if h not in seen:
            seen.add(h)
            unique.append(msg)
    return unique


# ─── Intent Classification ───────────────────────────────────────────
INTENT_PATTERNS = {
    'quote_request': [
        r'(how\s*much|price|cost|quote|₦|charge|rate|what\s*(is|are)\s*(the|your)\s*(price|rate|charge))',
        r'(i\s*(need|want)\s*(to\s*)?(get|make|order|buy).*\d+\s*(pieces?|pcs|units?|items?))',
        r'(give\s*me.*(price|quote|estimate))',
    ],
    'order_placement': [
        r'(i\s*(want|need|would\s*like)\s*to\s*(order|place|make|get|buy))',
        r'(go\s*ahead|proceed|confirm|yes\s*(please|ma)?\s*book|place\s*(the|my)\s*order)',
        r'(send\s*(me\s*)?(account|payment|invoice|receipt))',
    ],
    'material_inquiry': [
        r'(what\s*materials?|do\s*you\s*(cut|do|work|have|offer)\s*(with\s*)?(fabric|leather|wood|acrylic|metal))',
        r'(can\s*you\s*(cut|do).*(fabric|leather|wood|acrylic|metal))',
        r'(material|substrate)\s*(you|do\s*you)\s*(use|have|offer|work)',
    ],
    'delivery_inquiry': [
        r'(delivery|dispatch|ship|send|courier|waybill|transport)',
        r'(how\s*(long|fast|soon).*(get|receive|deliver|ready))',
        r'(do\s*you\s*deliver|pick\s*up|location|address)',
    ],
    'lead_time': [
        r'(how\s*(long|fast|soon|quick|many\s*days))',
        r'(lead\s*time|turnaround|when\s*.*ready|when\s*.*done|ETA)',
        r'(express|urgent|rush|asap|fast\s*track)',
    ],
    'design_inquiry': [
        r'(design|logo|artwork|file\s*format|vector|svg|dxf|eps|ai|cdr)',
        r'(can\s*you\s*(design|create|make|do).*(for\s*me))',
        r'(template|mockup|sample|proof|draft)',
    ],
    'greeting': [
        r'^(good\s*(morning|afternoon|evening|day)|hello|hi|hey|greetings)\b',
        r'^(how\s*are\s*you|how\s*you\s*dey|how\s*far)',
    ],
    'general_info': [
        r'(tell\s*me\s*(more\s*)?about|what\s*do\s*you|what\s*is\s*paberin|who\s*are\s*you)',
        r'(services?|products?|catalog|list|offerings?)',
    ],
}


def classify_intent(content: str) -> str:
    """Classify a customer message by intent using regex patterns."""
    lower = content.lower()
    scores = defaultdict(int)

    for intent, patterns in INTENT_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, lower):
                scores[intent] += 1

    if not scores:
        return 'other'

    # Return the intent with the most matches
    return max(scores, key=scores.get)


# ─── Agnes AI Augmentation ──────────────────────────────────────────
SYSTEM_PROMPT_FOR_DATASET = """You are an expert evaluator for the Paberin Creations AI assistant.
Paberin is a laser cutting business in Lagos, Nigeria that cuts:
- Fabric (aso oke, ankara, lace, cotton, linen, velvet, chantilly) for garments
- Leather for tags, labels, accessories
- Wood (MDF, plywood) for signage, cake toppers
- Acrylic (clear, colored, mirrored) for signage, cake toppers, tags
- Metal sheets (via external partner)

Services and PRICING (in Nigerian Naira ₦):
- Fabric cutting: ₦5,000-₦75,000 depending on garment type
- Leather tags/labels: ₦500-₦2,000 per piece depending on size
- Acrylic cake toppers: ₦5,000-₦15,000
- Wood engraving: ₦5,000-₦10,000
- Metal cutting: ₦70,000+ (external partner)
- Phone engraving: ₦5,000
- Jewelry engraving: ₦5,000-₦7,000
- Small items (stirrers, sticks): ₦100-₦2,000 per piece
- Custom quotes for complex/bulk orders
- Express surcharge: +50%, minimum 48 hours
- Standard lead time: 5 working days
- NO VAT
- Full payment before production

Delivery:
- Pickup from Ogba, Ikeja, Lagos (free)
- Local delivery within Lagos: ₦1,500-₦3,000
- Nationwide waybill: ₦3,500

For each customer message below, provide a JSON object with:
{
  "ideal_response": "The perfect assistant response. Be warm, professional, nigerian-friendly. Include specific prices in ₦ where relevant. Mention lead times. Ask clarifying questions if needed.",
  "quote_expected": { "price": number_or_null, "summary": "string" },
  "render_order_now": true_or_false,
  "intent": "quote_request|order_placement|material_inquiry|delivery_inquiry|lead_time|design_inquiry|greeting|general_info|other",
  "confidence": 0.0_to_1.0,
  "key_entities": {"service": "string_or_null", "quantity": number_or_null, "material": "string_or_null", "sla": "Standard|Express|null"}
}

Return ONLY valid JSON (no markdown code blocks, no extra text)."""


def call_agnes(user_message: str, retries: int = 3) -> dict | None:
    """Call Agnes 2.0 Flash to generate ideal response for a customer message."""
    payload = {
        "model": "agnes-2.0-flash",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_FOR_DATASET},
            {"role": "user", "content": f"Customer message: \"{user_message}\""},
        ],
        "temperature": 0.3,
        "max_tokens": 1024,
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
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                content = data["choices"][0]["message"]["content"]

                # Try to parse as JSON (Agnes might wrap in markdown)
                content = content.strip()
                if content.startswith("```"):
                    content = re.sub(r'^```(?:json)?\s*', '', content)
                    content = re.sub(r'\s*```$', '', content)

                return json.loads(content)

        except (urllib.error.URLError, json.JSONDecodeError, KeyError) as e:
            if attempt < retries - 1:
                wait = (2 ** attempt) * 1000 / 1000
                time.sleep(wait)
            else:
                print(f"  [WARN] Agnes call failed after {retries} attempts: {e}")
                return None


# ─── Main Pipeline ───────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("PABERIN CHAT DATASET GENERATOR")
    print("=" * 60)

    # Step 1: Parse all chat files
    print("\n[1/5] Parsing WhatsApp chat files...")
    all_customer_msgs = []
    txt_files = sorted(Path(WHATSAPP_DIR).glob("*.txt"))
    print(f"  Found {len(txt_files)} chat files")

    stats = {
        'files_processed': 0,
        'total_messages': 0,
        'customer_messages': 0,
        'business_messages': 0,
    }

    for fp in txt_files:
        msgs = parse_chat_file(str(fp))
        stats['total_messages'] += len(msgs)
        customer_msgs = extract_customer_messages(msgs)
        all_customer_msgs.extend(customer_msgs)
        stats['customer_messages'] += len(customer_msgs)
        stats['business_messages'] += len([m for m in msgs if m['role'] == 'business'])
        stats['files_processed'] += 1

    print(f"  Processed {stats['files_processed']} files")
    print(f"  Total messages: {stats['total_messages']}")
    print(f"  Customer messages: {stats['customer_messages']}")
    print(f"  Business messages: {stats['business_messages']}")

    # Step 2: Deduplicate
    print("\n[2/5] Deduplicating customer messages...")
    unique_msgs = deduplicate(all_customer_msgs)
    print(f"  Before: {len(all_customer_msgs)}, After dedup: {len(unique_msgs)}")

    # Step 3: Classify intents
    print("\n[3/5] Classifying intents...")
    intent_counts = defaultdict(int)
    for msg in unique_msgs:
        msg['intent'] = classify_intent(msg['content'])
        intent_counts[msg['intent']] += 1

    print("  Intent distribution:")
    for intent, count in sorted(intent_counts.items(), key=lambda x: -x[1]):
        print(f"    {intent}: {count}")

    # Save raw dataset (before Agnes augmentation)
    raw_dataset = []
    for msg in unique_msgs:
        raw_dataset.append({
            'id': hashlib.md5(msg['content'].encode()).hexdigest()[:12],
            'content': msg['content'],
            'intent': msg['intent'],
            'timestamp': msg.get('timestamp', ''),
            'source_file': msg.get('file', ''),
        })

    raw_path = OUTPUT_DIR / "paberin_chat_dataset_raw.json"
    with open(raw_path, 'w', encoding='utf-8') as f:
        json.dump({
            'meta': {
                'generated_at': datetime.now().isoformat(),
                'total_messages': len(raw_dataset),
                'intent_distribution': dict(intent_counts),
                'source': 'WhatsApp chat exports',
                'brand': 'Paberin',
            },
            'messages': raw_dataset,
        }, f, ensure_ascii=False, indent=2)
    print(f"\n  Raw dataset saved to: {raw_path}")

    # Step 4: Augment with Agnes (generate ideal responses)
    print("\n[4/5] Augmenting with Agnes AI (generating ideal responses)...")
    to_augment = unique_msgs[:MAX_AUGMENT] if MAX_AUGMENT > 0 else unique_msgs
    print(f"  Processing {len(to_augment)} messages (MAX_AUGMENT={MAX_AUGMENT})")

    augmented = []
    for i, msg in enumerate(to_augment):
        if i % 10 == 0:
            print(f"  Progress: {i}/{len(to_augment)}")

        agnes_result = call_agnes(msg['content'])

        entry = {
            'id': hashlib.md5(msg['content'].encode()).hexdigest()[:12],
            'customer_message': msg['content'],
            'detected_intent': msg['intent'],
            'source_file': msg.get('file', ''),
        }

        if agnes_result:
            entry['ideal_response'] = agnes_result.get('ideal_response', '')
            entry['expected_quote'] = agnes_result.get('quote_expected', {})
            entry['expected_render_order_now'] = agnes_result.get('render_order_now', False)
            entry['agnes_intent'] = agnes_result.get('intent', msg['intent'])
            entry['confidence'] = agnes_result.get('confidence', 0.5)
            entry['key_entities'] = agnes_result.get('key_entities', {})
        else:
            entry['ideal_response'] = None
            entry['expected_quote'] = None
            entry['agnes_augmented'] = False

        augmented.append(entry)
        time.sleep(DELAY_MS / 1000.0)

    print(f"  Augmented: {sum(1 for e in augmented if e.get('ideal_response'))}/{len(augmented)}")

    # Step 5: Save final dataset
    print("\n[5/5] Saving final dataset...")
    final_dataset = {
        'meta': {
            'generated_at': datetime.now().isoformat(),
            'version': '1.0',
            'total_cases': len(augmented),
            'augmented_count': sum(1 for e in augmented if e.get('ideal_response')),
            'intent_distribution': dict(intent_counts),
            'source': 'WhatsApp chat exports + Agnes 2.0 Flash augmentation',
            'brand': 'Paberin',
            'pricing_note': 'Prices are based on Paberin service catalog. All amounts in ₦ Naira. NO VAT.',
        },
        'test_cases': augmented,
    }

    final_path = OUTPUT_DIR / "paberin_chat_eval_dataset.json"
    with open(final_path, 'w', encoding='utf-8') as f:
        json.dump(final_dataset, f, ensure_ascii=False, indent=2)

    print(f"  Final dataset saved to: {final_path}")
    print(f"  Size: {final_path.stat().st_size / 1024:.1f} KB")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Chat files processed:    {stats['files_processed']}")
    print(f"  Customer messages found: {stats['customer_messages']}")
    print(f"  After deduplication:     {len(unique_msgs)}")
    print(f"  Agnes augmented:         {sum(1 for e in augmented if e.get('ideal_response'))}")
    print(f"  Dataset saved to:        {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == '__main__':
    main()
