/**
 * Pre-warm the Umang (Kya Likha Hai) cache — a SEPARATE namespace from klh:.
 *
 * Keys:  umang:{journeyId}:{dim}:{persona}:{verbosity}:hi   (double-encoded)
 * Set:   13 journeys × 2 CAS dims (kya_likha_hai, faida) × 3 personas × 3 verbosity
 *        = 234 entries.
 *
 * Idempotent (skip-existing) + retry 3x + read-back verify + local backup to
 * scripts/umang-chunks-backup.json (restore later with restore-umang-chunks.js, $0).
 *
 * Usage:  node scripts/seed-umang-chunks.js
 *         FORCE=1 node scripts/seed-umang-chunks.js   (regenerate everything)
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
const BACKUP_PATH = path.join(__dirname, 'umang-chunks-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN || !ANTHROPIC_KEY) {
  console.error('Missing env vars. Need: ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  console.error('Tip: run  vercel env pull .env.vercel  and copy the two UPSTASH_ lines into .env');
  process.exit(1);
}

const SCREENS = {
  ekyc: 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data are shared with the service provider. Shares full name, address, photo, date of birth, Aadhaar number. Irrevocable — identity data cannot be recalled.',
  nach_mandate: 'Sign NACH e-Mandate. Creditor QuickLoan NBFC. Up to ₹25,000/month auto-debit for 3 years. Irrevocable for the mandate period.',
  credit_line: 'Activate pre-approved credit line. Lender QuickCash NBFC. Limit ₹50,000 at 18% APR. EMI auto-debit. Late penalty ₹500 + interest. Reported to credit bureau.',
  collect_unknown: 'Collect request from unknown UPI ID fraud_alert99@paytm for ₹15,000. Approving DEBITS money from YOUR account. Sender unverified. Irrevocable.',
  token_lock: 'Lock Land Parcel Token #LPT-4421 via Finternet unified ledger for 180 days. Cannot transfer, sell, or use as collateral during lock. Irrevocable for the lock duration.',
  p2p_large_unknown: 'Send ₹8,500 to an unknown, unverified UPI ID merchant8847@ybl. First time transfer. Irrevocable once sent.',
  beneficiary_add: 'Add new beneficiary Unknown Trader, A/C ****7823, IFSC SBIN0001234. Once added, future transfers skip re-verification.',
  aadhaar_sign: 'Sign Property Sale Agreement with Aadhaar e-Sign. Legally binding electronic signature, enforceable under IT Act 2000. Irrevocable; Aadhaar identity permanently linked to the document.',
  autopay: 'Setup UPI AutoPay. Merchant StreamFlix Premium ₹599/month recurring without UPI PIN after first authorization. Cancel anytime from UPI app settings.',
  p2p_small: 'Send ₹350 to Rahul Sharma via UPI (rahul@okaxis). Enter UPI PIN to confirm. Refund possible if sent to wrong UPI ID — contact bank within 24 hours.',
  p2m_qr: 'Pay verified merchant Fresh Mart Store ₹1,200 via QR scan. Enter UPI PIN to pay.',
  ondc: 'Place order via ONDC open network. Seller KisanDirect Farm, Organic Rice 5kg, ₹450. Open network — dispute resolution differs from marketplace apps.',
  balance: 'Check your account balance. Your available balance will be shown after UPI PIN verification. Balance enquiry is free. No money is moved.',
};

const DIMS = {
  kya_likha_hai: 'COMPREHENSION. Explain plainly what this screen says and is asking the user to do — the key facts, data, amounts, and whether it can be undone. Help them simply understand what is written.',
  faida: 'ACTION / BENEFIT. Explain what the user gains or risks here and what they should do — is it worth it, what is the benefit versus the cost, and the practical next step.',
};

const PERSONAS = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};

const VERBOSITY = {
  LOW: 'Write 40-60 words. Short sentences, the single most important point.',
  MEDIUM: 'Write 60-100 words. Cover the key points clearly.',
  HIGH: 'Write 100-150 words. Cover every risk, number, and term.',
};

const jobs = [];
for (const j of Object.keys(SCREENS)) {
  for (const dim of Object.keys(DIMS)) {
    for (const p of Object.keys(PERSONAS)) {
      for (const v of Object.keys(VERBOSITY)) {
        jobs.push({ key: `umang:${j}:${dim}:${p}:${v}:hi`, journey: j, dim, persona: p, verbosity: v });
      }
    }
  }
}
console.log(`\n📦 Umang cache — ${jobs.length} entries (skip-existing ${FORCE ? 'OFF (FORCE)' : 'ON'})...\n`);

async function redisSet(key, entryObj) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(entryObj)),
  });
  if (!r.ok) throw new Error(`Redis SET ${r.status}: ${await r.text()}`);
}
async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.result) return null;
  let p = JSON.parse(d.result); if (typeof p === 'string') p = JSON.parse(p);
  return p;
}

async function generate(job, attempt = 1) {
  const prompt = `You are GATO, the DPIx Journey Intelligence agent, talking to the user about a financial consent screen in the Umang-style government app.

SCREEN CONTENT:
${SCREENS[job.journey]}

PERSONA: ${PERSONAS[job.persona]}

FOCUS: ${DIMS[job.dim]}

LENGTH: ${VERBOSITY[job.verbosity]}

LANGUAGE: Hindi — Devanagari script ONLY, no Roman letters except unavoidable product names. Conversational spoken register, no filler. Output ONLY the spoken words.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
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
        if (existing && existing.script) { backup.push({ key: job.key, value: existing }); console.log(`${label} ... ◦ skip`); skipped++; continue; }
      }
      process.stdout.write(`${label} ... `);
      const script = await generate(job);
      const entry = { script, dim: job.dim, journey: job.journey, persona: job.persona, verbosity: job.verbosity, language: 'hi', generated_at: new Date().toISOString(), model: 'claude-sonnet-4-5', tier: 1 };
      await redisSet(job.key, entry);
      const check = await redisGet(job.key);
      if (!check || !check.script) throw new Error('verify failed after SET');
      backup.push({ key: job.key, value: entry });
      console.log(`✓ (${script.length} chars, verified)`);
      made++;
      await new Promise(r => setTimeout(r, 1200));
    } catch (e) { console.log(`✗ ${e.message}`); failed++; }
  }
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ saved_at: new Date().toISOString(), count: backup.length, entries: backup }, null, 2));
  console.log(`\n✅ Done. ${made} generated, ${skipped} reused, ${failed} failed.`);
  console.log(`💾 Backup (${backup.length} keys): ${BACKUP_PATH}`);
  console.log(`   Recover with: node scripts/restore-umang-chunks.js  (no Claude calls)\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
