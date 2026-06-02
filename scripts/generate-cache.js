/**
 * Offline narration cache generator — Tier 1
 * Generates narrations for top L4 journeys × personas × verbosity levels in Hindi,
 * plus 5 English variants for collect_unknown.
 * Stores results in Upstash Redis.
 *
 * Usage: node scripts/generate-cache.js
 * Requires .env with ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!UPSTASH_URL || !UPSTASH_TOKEN || !ANTHROPIC_KEY) {
  console.error('Missing env vars. Need: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ANTHROPIC_API_KEY');
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
      jobs.push({
        key: `klh:${j.id}:${personaId}:${vLevel}:hi`,
        journey: j,
        persona: personaProfile,
        verbosity: vLevel,
        vInstruction,
        lang: 'hi',
        langInstruction: LANG_INSTRUCTION.hi,
      });
    }
  }
}

// collect_unknown × 3 personas × 1 verbosity (MEDIUM) × English = 3
// + collect_unknown × arjun × LOW + HIGH × English = 2  → total 5 English
for (const [personaId, personaProfile] of Object.entries(PERSONAS)) {
  jobs.push({
    key: `klh:collect_unknown:${personaId}:MEDIUM:en`,
    journey: JOURNEYS[0],
    persona: personaProfile,
    verbosity: 'MEDIUM',
    vInstruction: VERBOSITY.MEDIUM,
    lang: 'en',
    langInstruction: LANG_INSTRUCTION.en,
  });
}
jobs.push({
  key: `klh:collect_unknown:arjun:LOW:en`,
  journey: JOURNEYS[0],
  persona: PERSONAS.arjun,
  verbosity: 'LOW',
  vInstruction: VERBOSITY.LOW,
  lang: 'en',
  langInstruction: LANG_INSTRUCTION.en,
});
jobs.push({
  key: `klh:collect_unknown:arjun:HIGH:en`,
  journey: JOURNEYS[0],
  persona: PERSONAS.arjun,
  verbosity: 'HIGH',
  vInstruction: VERBOSITY.HIGH,
  lang: 'en',
  langInstruction: LANG_INSTRUCTION.en,
});

console.log(`\n📦 Generating ${jobs.length} cache entries...\n`);

// ── Upstash REST helper ──────────────────────────────────────
async function redisSet(key, value) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`Redis SET failed: ${r.status} ${await r.text()}`);
}

// ── Claude call ──────────────────────────────────────────────
async function generateNarration(job) {
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

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API ${r.status}: ${err}`);
  }

  const data = await r.json();
  return data.content?.[0]?.text?.trim() || '';
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const label = `[${i + 1}/${jobs.length}] ${job.key}`;
    try {
      process.stdout.write(`${label} ... `);
      const script = await generateNarration(job);
      if (!script) throw new Error('Empty response');

      const entry = {
        script,
        journey: job.journey.id,
        persona: job.key.split(':')[2],
        verbosity: job.verbosity,
        language: job.lang,
        generated_at: new Date().toISOString(),
        model: 'claude-sonnet-4-5',
        tier: 1,
      };

      await redisSet(job.key, JSON.stringify(entry));
      console.log(`✓ (${script.length} chars)`);
      success++;

      // Rate limit: ~1 req/sec to stay within Claude limits
      if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done. ${success} cached, ${failed} failed.\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
