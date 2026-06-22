/**
 * Generate conversational chunks for ALL 13 KLH journeys (multi-journey duplex).
 *
 * Key scheme:  klh:{journeyId}:chunk:{chunkId}:{persona}:hi   (double-encoded,
 *              matches generate-ekyc-chunks.js and api/journey-chunk.js cacheGet)
 *
 * Reuse: eKYC's 27 chunks are already seeded. This script is idempotent — it
 * reads each key first and SKIPS any chunk already present (so eKYC costs $0 and
 * a re-run only fills gaps). Set FORCE=1 to regenerate everything.
 *
 * Durability (same as seed-cache.js): retry 3x · read-back verify · local backup
 * to scripts/chunks-backup.json (restore later with restore-chunks.js, $0).
 *
 * Usage:  node scripts/generate-chunks.js
 *         FORCE=1 node scripts/generate-chunks.js     (ignore existing keys)
 * Requires .env: ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 *   (Tip: vercel env pull .env.vercel  then copy the two UPSTASH_ lines into .env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const FORCE = process.env.FORCE === '1';
const BACKUP_PATH = path.join(__dirname, 'chunks-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN || !ANTHROPIC_KEY) {
  console.error('Missing env vars. Need: ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  console.error('Tip: run  vercel env pull .env.vercel  and copy the two UPSTASH_ lines into .env');
  process.exit(1);
}

// ── Journeys: screen text + materiality-scaled chunk list ────────────────────
const JOURNEYS = [
  { id: 'ekyc', screen: 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data will be shared with the service provider. eKYC is irrevocable — once shared, your identity data cannot be recalled. Aadhaar-based eKYC shares: full name, address, photo, date of birth, and Aadhaar number. Digital consent required. I authorize sharing my Aadhaar details.', chunks: ['overview','data_shared','biometric','reversibility','consequence','who_gets_data','alternative','safety','action'] },
  { id: 'nach_mandate', screen: 'Sign NACH e-Mandate. Creditor: QuickLoan NBFC. Amount: up to ₹25,000/month. Frequency: Monthly auto-debit. Duration: 3 years (36 months). This mandate authorizes automatic debit from your account every month for 3 years. Irrevocable for mandate period. Digital signature consent required. Enter UPI PIN to authorize.', chunks: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'] },
  { id: 'credit_line', screen: 'Activate pre-approved credit line. Lender: QuickCash NBFC. Credit limit: ₹50,000. Interest rate: 18% APR. EMI auto-debit enabled. Late payment penalty: ₹500 + interest. By activating, you consent to loan terms, auto-debit mandate, and credit bureau reporting. Digital signature required.', chunks: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'] },
  { id: 'collect_unknown', screen: 'Collect request received from unknown UPI ID: fraud_alert99@paytm. Amount: ₹15,000. This is a collect request — money will be debited from YOUR account if you approve. Sender is unverified. Never approve collect requests from unknown sources. Enter UPI PIN to authorize consent. Irrevocable.', chunks: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'] },
  { id: 'token_lock', screen: 'Lock digital asset token via Finternet unified ledger. Asset: Land Parcel Token #LPT-4421. Lock duration: 180 days. During lock period, this token cannot be transferred, sold, or used as collateral. Asset freeze is irrevocable for lock duration. Digital signature and consent required. Token lock registered on unified ledger.', chunks: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'] },
  { id: 'p2p_large_unknown', screen: 'Send ₹8,500 to unknown contact. UPI ID: merchant8847@ybl. First time transfer to this UPI ID. This recipient is unverified. Amount ₹8,500. Enter UPI PIN to authorize consent. Irrevocable once sent.', chunks: ['overview','consequence','reversibility','safety','action'] },
  { id: 'beneficiary_add', screen: 'Add new beneficiary. Name: Unknown Trader. Account: ****7823. IFSC: SBIN0001234. First time beneficiary addition. Once added, quick transfers enabled without re-verification. Consent required to add. Verify details carefully.', chunks: ['overview','consequence','reversibility','who_gets_data','safety','action'] },
  { id: 'aadhaar_sign', screen: 'Sign document with Aadhaar digital signature. Document: Property Sale Agreement. This creates a legally binding electronic signature equivalent to a physical signature. Aadhaar e-Sign is irrevocable and legally enforceable under IT Act 2000. Your Aadhaar identity will be permanently linked to this document. Consent and biometric verification required. I authorize this digital signature.', chunks: ['overview','data_shared','reversibility','consequence','safety','action'] },
  { id: 'autopay', screen: 'Setup UPI AutoPay. Merchant: StreamFlix Premium. Amount: ₹599/month. Frequency: Monthly recurring. This enables recurring payment without UPI PIN after first authorization. Autopay will debit automatically every month. Consent to auto-debit. Cancel anytime from UPI app settings.', chunks: ['overview','consequence','reversibility','safety','action'] },
  { id: 'p2p_small', screen: 'Send ₹350 to Rahul Sharma via UPI. UPI ID: rahul@okaxis. Amount: ₹350. Enter UPI PIN to confirm payment. Refund possible if sent to wrong UPI ID — contact bank within 24 hours.', chunks: ['overview','consequence','action'] },
  { id: 'p2m_qr', screen: 'Pay merchant via QR code. Merchant: Fresh Mart Store. Verified merchant. Amount: ₹1,200. Payment to verified merchant via QR scan. Enter UPI PIN to pay.', chunks: ['overview','consequence','action'] },
  { id: 'ondc', screen: 'Place order via ONDC open network. Seller: KisanDirect Farm. Item: Organic Rice 5kg. Price: ₹450. Delivery via ONDC logistics. Refund policy per seller terms. Payment via UPI. ONDC is an open network — dispute resolution differs from marketplace apps.', chunks: ['overview','consequence','action'] },
  { id: 'balance', screen: 'Check your account balance. Your available balance will be shown after UPI PIN verification. Balance enquiry is free. No money is moved. Enter UPI PIN to view balance.', chunks: ['overview','consequence','action'] },
];

const CHUNK_PROMPTS = {
  overview:      'Explain what this screen is and what action it is asking the user to do. Quick orientation, the user just opened it.',
  data_shared:   'Explain exactly what personal data or money leaves the user in this transaction. Make each item concrete and relatable.',
  biometric:     'Explain the biometric requirement (fingerprint or iris scan) — unique body data that cannot be changed if compromised. Explain biometric in simple terms.',
  reversibility: 'Explain whether this can be undone. If it is irrevocable, say so clearly but without panic.',
  consequence:   'Explain what happens if the user proceeds — both the immediate effect and the longer-term implication.',
  who_gets_data: 'Explain who receives the data or the money, and that the user should verify who they are before proceeding.',
  alternative:   'Explain safer alternatives, or the option to slow down and verify before acting. The user has choices.',
  safety:        'Explain when this is safe versus dangerous. Give concrete red flags — unknown or unverified party, pressure to act fast.',
  action:        'Give a clear recommendation: proceed only if the user trusts the party and understands the action; otherwise decline and ask someone they trust. No rush.',
};

const PERSONAS = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};

// ── Build job list ───────────────────────────────────────────────────────────
const jobs = [];
for (const j of JOURNEYS) {
  for (const chunkId of j.chunks) {
    for (const [pid, profile] of Object.entries(PERSONAS)) {
      jobs.push({ key: `klh:${j.id}:chunk:${chunkId}:${pid}:hi`, journey: j, chunkId, persona: pid, profile });
    }
  }
}
console.log(`\n📦 ${jobs.length} total chunk jobs across ${JOURNEYS.length} journeys (skip-existing ${FORCE ? 'OFF (FORCE)' : 'ON'})...\n`);

// ── Upstash REST (double-encoded; matches api/journey-chunk.js cacheGet) ──────
async function redisSet(key, entryObj) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(entryObj)),
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

async function generate(job, attempt = 1) {
  const prompt = `You are GATO, the DPIx Journey Intelligence agent. The user is on a financial consent screen and is having a voice conversation with you about it.

SCREEN CONTENT:
${job.journey.screen}

PERSONA: ${job.profile}

USER'S QUESTION/INTENT: ${CHUNK_PROMPTS[job.chunkId]}

LANGUAGE: Hindi — write ONLY in Devanagari script. No Roman/English letters at all except unavoidable product names. Every word must be in Devanagari.

Rules:
- CONVERSATIONAL response, 2-4 sentences. Speak naturally, face to face.
- Match vocabulary to the persona — simple words for low literacy, casual for GenZ.
- Be direct and practical. No filler. Output ONLY the spoken words. No labels, no JSON.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
    const data = await r.json();
    const script = data.content?.[0]?.text?.trim() || '';
    if (!script) throw new Error('Empty response');
    return script;
  } catch (e) {
    if (attempt >= 3) throw e;
    const wait = 1500 * attempt;
    console.log(`  ↻ retry ${attempt + 1}/3: ${e.message.slice(0, 60)} (wait ${wait}ms)`);
    await new Promise(r => setTimeout(r, wait));
    return generate(job, attempt + 1);
  }
}

async function main() {
  let made = 0, skipped = 0, failed = 0;
  const backup = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const label = `[${i + 1}/${jobs.length}] ${job.key}`;
    try {
      if (!FORCE) {
        const existing = await redisGet(job.key);
        if (existing && existing.script) {
          backup.push({ key: job.key, value: existing });
          console.log(`${label} ... ◦ skip (exists)`);
          skipped++;
          continue;
        }
      }
      process.stdout.write(`${label} ... `);
      const script = await generate(job);
      const entry = { script, chunk: job.chunkId, journey: job.journey.id, persona: job.persona, language: 'hi', generated_at: new Date().toISOString(), model: 'claude-sonnet-4-5', tier: 1 };
      await redisSet(job.key, entry);
      const check = await redisGet(job.key);
      if (!check || !check.script) throw new Error('verify failed after SET');
      backup.push({ key: job.key, value: entry });
      console.log(`✓ (${script.length} chars, verified)`);
      made++;
      await new Promise(r => setTimeout(r, 1200)); // ~1 req/sec
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed++;
    }
  }

  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ saved_at: new Date().toISOString(), count: backup.length, entries: backup }, null, 2));
  console.log(`\n✅ Done. ${made} generated, ${skipped} reused, ${failed} failed.`);
  console.log(`💾 Backup (${backup.length} keys): ${BACKUP_PATH}`);
  console.log(`   Recover anytime with: node scripts/restore-chunks.js  (no Claude calls)\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
