/**
 * Tier 1 cache SEED — generates all narrations via Claude, writes to Upstash,
 * verifies each write, and saves a local backup snapshot.
 *
 * Durability features vs the old generate-cache.js:
 *   - Retries each Claude call up to 3x (transient errors no longer drop an entry)
 *   - Read-back verification: confirms every key is actually in Redis
 *   - Writes scripts/cache-backup.json so a future flush costs $0 to restore
 *     (use restore-cache.js — no Claude calls needed ever again)
 *   - Single-encoded storage, matching api/klh-script.js cacheGet()
 *
 * Usage: node scripts/seed-cache.js
 * Requires .env with ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BACKUP_PATH = path.join(__dirname, 'cache-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN || !ANTHROPIC_KEY) {
  console.error('Missing env vars. Need: ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  console.error('Tip: run  vercel env pull .env.vercel  and copy the two UPSTASH_ lines into .env');
  process.exit(1);
}

// ── Journey definitions (L4 only for starter cache) ──────────
const JOURNEYS = [
  { id: 'collect_unknown', screen: 'Collect request received from unknown UPI ID: fraud_alert99@paytm. Amount: ₹15,000. This is a collect request — money will be debited from YOUR account if you approve. Sender is unverified. Never approve collect requests from unknown sources. Enter UPI PIN to authorize consent. Irrevocable.' },
  { id: 'nach_mandate', screen: 'Sign NACH e-Mandate. Creditor: QuickLoan NBFC. Amount: up to ₹25,000/month. Frequency: Monthly auto-debit. Duration: 3 years (36 months). This mandate authorizes automatic debit from your account every month for 3 years. Irrevocable for mandate period. Digital signature consent required. Enter UPI PIN to authorize.' },
  { id: 'autopay', screen: 'Setup UPI AutoPay. Merchant: StreamFlix Premium. Amount: ₹599/month. Frequency: Monthly recurring. This enables recurring payment without UPI PIN after first authorization. Autopay will debit automatically every month. Consent to auto-debit. Cancel anytime from UPI app settings.' },
  { id: 'ekyc', screen: 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data will be shared with the service provider. eKYC is irrevocable — once shared, your identity data cannot be recalled. Aadhaar-based eKYC shares: full name, address, photo, date of birth, and Aadhaar number. Digital consent required. I authorize sharing my Aadhaar details.' },
  { id: 'credit_line', screen: 'Activate pre-approved credit line. Lender: QuickCash NBFC. Credit limit: ₹50,000. Interest rate: 18% APR. EMI auto-debit enabled. Late payment penalty: ₹500 + interest. By activating, you consent to loan terms, auto-debit mandate, and credit bureau reporting. Digital signature required.' },
];

const PERSONAS = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};

const VERBOSITY = {
  LOW:    'Write 40-60 words total. Short sentences. Most important point only.',
  MEDIUM: 'Write 60-100 words total. Cover key points clearly.',
  HIGH:   'Write 100-150 words minimum. Cover ALL content — every risk, every number, every term. Leave nothing out.',
};

const LANG_INSTRUCTION = {
  hi: 'Hindi — write ONLY in Devanagari script. No Roman/English letters at all. Wrong: "aapki zameen". Correct: "आपकी ज़मीन". Every single word must be in Devanagari.',
  en: 'English — write in plain English only. No other script.',
};

// ── Build the job list ───────────────────────────────────────
const jobs = [];
// All 5 journeys × 3 personas × 3 verbosity × Hindi = 45
for (const j of JOURNEYS) {
  for (const [personaId, personaProfile] of Object.entries(PERSONAS)) {
    for (const [vLevel, vInstruction] of Object.entries(VERBOSITY)) {
      jobs.push({ key: `klh:${j.id}:${personaId}:${vLevel}:hi`, journey: j, personaId, persona: personaProfile, verbosity: vLevel, vInstruction, lang: 'hi', langInstruction: LANG_INSTRUCTION.hi });
    }
  }
}
// collect_unknown English variants = 5
for (const [personaId, personaProfile] of Object.entries(PERSONAS)) {
  jobs.push({ key: `klh:collect_unknown:${personaId}:MEDIUM:en`, journey: JOURNEYS[0], personaId, persona: personaProfile, verbosity: 'MEDIUM', vInstruction: VERBOSITY.MEDIUM, lang: 'en', langInstruction: LANG_INSTRUCTION.en });
}
jobs.push({ key: `klh:collect_unknown:arjun:LOW:en`,  journey: JOURNEYS[0], personaId: 'arjun', persona: PERSONAS.arjun, verbosity: 'LOW',  vInstruction: VERBOSITY.LOW,  lang: 'en', langInstruction: LANG_INSTRUCTION.en });
jobs.push({ key: `klh:collect_unknown:arjun:HIGH:en`, journey: JOURNEYS[0], personaId: 'arjun', persona: PERSONAS.arjun, verbosity: 'HIGH', vInstruction: VERBOSITY.HIGH, lang: 'en', langInstruction: LANG_INSTRUCTION.en });

console.log(`\n📦 Seeding ${jobs.length} cache entries (with retry + verify + backup)...\n`);

// ── Upstash REST helpers (single-encoded; matches cacheGet) ──
async function redisSet(key, entry) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(`Redis SET ${r.status}: ${await r.text()}`);
}
async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.result) return null;
  let p = JSON.parse(d.result);
  if (typeof p === 'string') p = JSON.parse(p);
  return p;
}

// ── Claude call with retries ─────────────────────────────────
async function generateNarration(job, attempt = 1) {
  const prompt = `You are GATO, the DPIx Journey Intelligence agent. Generate an audio explanation script.

SCREEN CONTENT:
${job.journey.screen}

PERSONA: ${job.persona}

LANGUAGE INSTRUCTION: ${job.langInstruction}

LENGTH INSTRUCTION: ${job.vInstruction}

Rules:
- Follow the LANGUAGE INSTRUCTION exactly. This is the most important rule.
- Use colloquial spoken register, not formal written register.
- For CONSEQUENTIAL steps: explain every risk, number, and term.
- Write as natural spoken audio — no bullets, no headers, flowing speech only.
- End with a reassuring or action-oriented closing line.

Return ONLY the script text. No JSON. No labels. No explanation. Just the words to be spoken.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const script = data.content?.[0]?.text?.trim() || '';
    if (!script) throw new Error('Empty response');
    return script;
  } catch (e) {
    if (attempt >= 3) throw e;
    const wait = 1500 * attempt;
    console.log(`  ↻ retry ${attempt + 1}/3 after error: ${e.message.slice(0, 60)} (waiting ${wait}ms)`);
    await new Promise(r => setTimeout(r, wait));
    return generateNarration(job, attempt + 1);
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  let success = 0, failed = 0;
  const backup = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const label = `[${i + 1}/${jobs.length}] ${job.key}`;
    try {
      process.stdout.write(`${label} ... `);
      const script = await generateNarration(job);
      const entry = {
        script, journey: job.journey.id, persona: job.personaId, verbosity: job.verbosity,
        language: job.lang, generated_at: new Date().toISOString(), model: 'claude-sonnet-4-5', tier: 1,
      };
      await redisSet(job.key, entry);
      // verify read-back
      const check = await redisGet(job.key);
      if (!check || !check.script) throw new Error('verify failed — key not readable after SET');
      backup.push({ key: job.key, value: entry });
      console.log(`✓ (${script.length} chars, verified)`);
      success++;
      if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 1200)); // ~1 req/sec
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed++;
    }
  }

  // Save local backup snapshot (durability: restore later with $0 cost)
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ saved_at: new Date().toISOString(), count: backup.length, entries: backup }, null, 2));

  console.log(`\n✅ Done. ${success} cached & verified, ${failed} failed.`);
  console.log(`💾 Backup written: ${BACKUP_PATH}`);
  console.log(`   Future recovery: node scripts/restore-cache.js  (no Claude calls, instant)\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
