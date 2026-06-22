// /api/journey-chunk — generalized conversational-chunk endpoint for the
// multi-journey duplex / tier-compare demo.
//
// Generalizes /api/ekyc-chunk.js to ANY journey. Same cache scheme, so the
// already-seeded eKYC chunks (klh:ekyc:chunk:*) are reused as-is.
//
// Request:  POST { transcript, persona, journeyId, nocache? }
// Response: { script, intent, source:'cache'|'live', cache_key, journeyId, latency_ms }
//
// Cache key: klh:{journeyId}:chunk:{chunkId}:{persona}:hi  (single-encoded JSON)
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ANTHROPIC_API_KEY

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Per-journey screen text (drives live generation) ─────────────────────────
const SCREENS = {
  balance: 'Check your account balance. Your available balance will be shown after UPI PIN verification. Balance enquiry is free. No money is moved. Enter UPI PIN to view balance.',
  p2p_small: 'Send ₹350 to Rahul Sharma via UPI. UPI ID: rahul@okaxis. Amount: ₹350. Enter UPI PIN to confirm payment. Refund possible if sent to wrong UPI ID — contact bank within 24 hours.',
  p2p_large_unknown: 'Send ₹8,500 to unknown contact. UPI ID: merchant8847@ybl. First time transfer to this UPI ID. This recipient is unverified. Amount ₹8,500. Enter UPI PIN to authorize consent. Irrevocable once sent.',
  p2m_qr: 'Pay merchant via QR code. Merchant: Fresh Mart Store. Verified merchant. Amount: ₹1,200. Payment to verified merchant via QR scan. Enter UPI PIN to pay.',
  collect_unknown: 'Collect request received from unknown UPI ID: fraud_alert99@paytm. Amount: ₹15,000. This is a collect request — money will be debited from YOUR account if you approve. Sender is unverified. Never approve collect requests from unknown sources. Enter UPI PIN to authorize consent. Irrevocable.',
  beneficiary_add: 'Add new beneficiary. Name: Unknown Trader. Account: ****7823. IFSC: SBIN0001234. First time beneficiary addition. Once added, quick transfers enabled without re-verification. Consent required to add. Verify details carefully.',
  nach_mandate: 'Sign NACH e-Mandate. Creditor: QuickLoan NBFC. Amount: up to ₹25,000/month. Frequency: Monthly auto-debit. Duration: 3 years (36 months). This mandate authorizes automatic debit from your account every month for 3 years. Irrevocable for mandate period. Digital signature consent required. Enter UPI PIN to authorize.',
  autopay: 'Setup UPI AutoPay. Merchant: StreamFlix Premium. Amount: ₹599/month. Frequency: Monthly recurring. This enables recurring payment without UPI PIN after first authorization. Autopay will debit automatically every month. Consent to auto-debit. Cancel anytime from UPI app settings.',
  ekyc: 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data will be shared with the service provider. eKYC is irrevocable — once shared, your identity data cannot be recalled. Aadhaar-based eKYC shares: full name, address, photo, date of birth, and Aadhaar number. Digital consent required. I authorize sharing my Aadhaar details.',
  credit_line: 'Activate pre-approved credit line. Lender: QuickCash NBFC. Credit limit: ₹50,000. Interest rate: 18% APR. EMI auto-debit enabled. Late payment penalty: ₹500 + interest. By activating, you consent to loan terms, auto-debit mandate, and credit bureau reporting. Digital signature required.',
  ondc: 'Place order via ONDC open network. Seller: KisanDirect Farm. Item: Organic Rice 5kg. Price: ₹450. Delivery via ONDC logistics. Refund policy per seller terms. Payment via UPI. ONDC is an open network — dispute resolution differs from marketplace apps.',
  token_lock: 'Lock digital asset token via Finternet unified ledger. Asset: Land Parcel Token #LPT-4421. Lock duration: 180 days. During lock period, this token cannot be transferred, sold, or used as collateral. Asset freeze is irrevocable for lock duration. Digital signature and consent required. Token lock registered on unified ledger.',
  aadhaar_sign: 'Sign document with Aadhaar digital signature. Document: Property Sale Agreement. This creates a legally binding electronic signature equivalent to a physical signature. Aadhaar e-Sign is irrevocable and legally enforceable under IT Act 2000. Your Aadhaar identity will be permanently linked to this document. Consent and biometric verification required. I authorize this digital signature.',
};

// Which chunks each journey legitimately exposes (materiality-scaled).
const JOURNEY_CHUNKS = {
  ekyc: ['overview','data_shared','biometric','reversibility','consequence','who_gets_data','alternative','safety','action'],
  nach_mandate: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'],
  credit_line: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'],
  collect_unknown: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'],
  token_lock: ['overview','data_shared','reversibility','consequence','who_gets_data','alternative','safety','action'],
  p2p_large_unknown: ['overview','consequence','reversibility','safety','action'],
  beneficiary_add: ['overview','consequence','reversibility','who_gets_data','safety','action'],
  aadhaar_sign: ['overview','data_shared','reversibility','consequence','safety','action'],
  autopay: ['overview','consequence','reversibility','safety','action'],
  p2p_small: ['overview','consequence','action'],
  p2m_qr: ['overview','consequence','action'],
  ondc: ['overview','consequence','action'],
  balance: ['overview','consequence','action'],
};

// ── Intent classification: keyword → chunkId (EN + Hindi + Hinglish) ──────────
const INTENT_MAP = [
  { id: 'data_shared',  patterns: ['data','share','jaankari','kya share','information','details','naam','pata','photo','address','name','क्या share','जानकारी','साझा'] },
  { id: 'reversibility',patterns: ['wapas','cancel','undo','reverse','ruk','rok','hatao','vapas','back','return','irrevers','वापस','रोक','उल्टा'] },
  { id: 'biometric',    patterns: ['ungali','finger','iris','biometric','scan','nishaan','anguli','aankh','उंगली','आँख','बायोमेट्रिक'] },
  { id: 'consequence',  patterns: ['kya hoga','what happen','result','agar','hoga','baad','after','then what','phir','क्या होगा','अगर','बाद'] },
  { id: 'who_gets_data',patterns: ['kaun','company','kis ko','who','provider','kisko','konsa','कौन','किसको','कंपनी'] },
  { id: 'alternative',  patterns: ['aur koi','other','option','alternative','bina','without','dusra','tarika','और तरीका','दूसरा','विकल्प'] },
  { id: 'safety',       patterns: ['safe','surakshit','khatarnak','danger','risk','dhoka','fraud','sahi','galat','thik','सुरक्षित','खतरा','ठगी','safe है'] },
  { id: 'action',       patterns: ['kya karu','what do','aage','proceed','karu','should i','karna chahiye','haan','nahi','yes','no','क्या करूँ','आगे','करूँ'] },
  { id: 'overview',     patterns: ['samjhao','explain','kya hai','what is','batao','bolo','shuru','start','क्या है','समझाओ','बताओ'] },
];

function matchIntent(transcript, journeyId) {
  const allowed = JOURNEY_CHUNKS[journeyId] || JOURNEY_CHUNKS.ekyc;
  if (!transcript) return 'overview';
  const lower = transcript.toLowerCase();
  let bestMatch = null, bestScore = 0;
  for (const intent of INTENT_MAP) {
    if (!allowed.includes(intent.id)) continue;
    let score = 0;
    for (const p of intent.patterns) { if (lower.includes(p.toLowerCase())) score++; }
    if (score > bestScore) { bestScore = score; bestMatch = intent.id; }
  }
  return bestMatch || 'overview';
}

const PERSONA_PROFILE = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};

// ── Upstash REST (single-encoded; matches ekyc-chunk.js / seed-cache.js) ──────
async function cacheGet(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.result) return null;
    let parsed = JSON.parse(data.result);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed;
  } catch { return null; }
}
async function cacheSet(key, entry) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(entry)),
    });
  } catch { /* best-effort write-back */ }
}

async function generateLive(journeyId, chunkId, personaSlug, transcript) {
  const screen = SCREENS[journeyId] || SCREENS.ekyc;
  const profile = PERSONA_PROFILE[personaSlug] || PERSONA_PROFILE.rajan;
  const prompt = `You are GATO, the DPIx Journey Intelligence agent. The user is on a financial consent screen and is having a voice conversation with you about it.

SCREEN CONTENT:
${screen}

PERSONA: ${profile}

THE USER ASKED: "${transcript || ''}"
FOCUS OF THE ANSWER (intent): ${chunkId}

LANGUAGE: Hindi — write ONLY in Devanagari script. No Roman/English letters except unavoidable product names. Every word must be Devanagari.

Rules:
- Conversational, 2-4 sentences. Speak as if face to face.
- Match vocabulary to the persona — simple for low literacy, casual for GenZ.
- Be direct and practical. No filler. Output ONLY the spoken words.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error('Claude ' + r.status);
  const data = await r.json();
  return data.content?.[0]?.text?.trim() || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const t0 = Date.now();
  const { transcript, persona, journeyId, nocache } = req.body || {};
  const journey = SCREENS[journeyId] ? journeyId : 'ekyc';
  const personaSlug = PERSONA_PROFILE[persona] ? persona : 'rajan';
  const intentId = matchIntent(transcript, journey);
  const key = `klh:${journey}:chunk:${intentId}:${personaSlug}:hi`;

  // Tier 1 — cache (unless forced live)
  if (!nocache) {
    const cached = await cacheGet(key);
    if (cached && cached.script) {
      return res.status(200).json({
        script: cached.script, intent: intentId, source: 'cache',
        cache_key: key, journeyId: journey, latency_ms: Date.now() - t0,
      });
    }
  }

  // Tier 2 — live generation
  try {
    const script = await generateLive(journey, intentId, personaSlug, transcript);
    if (!script) throw new Error('Empty generation');
    // Self-heal: write back to cache on a genuine miss (not on forced-live runs)
    if (!nocache) {
      await cacheSet(key, {
        script, chunk: intentId, journey, persona: personaSlug,
        language: 'hi', generated_at: new Date().toISOString(), model: 'claude-sonnet-4-5', tier: 1,
      });
    }
    return res.status(200).json({
      script, intent: intentId, source: 'live',
      cache_key: key, journeyId: journey, latency_ms: Date.now() - t0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, journeyId: journey, intent: intentId });
  }
}
