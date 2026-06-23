// /api/umang-chunk — Umang (Kya Likha Hai) endpoint.
//
// Modes:
//   compare  → first run / chip. One CAS dim (kya_likha_hai | faida). Page calls
//              twice (cache + nocache) to fill Tier 1 and Tier 2.
//   followon → free-text follow-up. PHASE 1: fast indexed TF-IDF match against the
//              prebuilt index (umang:idx:{journey}:{persona}, one GET). If best ≥
//              threshold → Haiku rephrases the cached text (Tier 1). Else returns
//              { tier:2, needLive:true, notice } WITHOUT calling the LLM (fast) so the
//              page can show the "checking online" modal and then call:
//   live     → PHASE 2: generate the Tier-2 answer from the curated provider table.
//
// Cache namespace (isolated from klh:, same Upstash DB):
//   umang:{journeyId}:{dim}:{persona}:{verbosity}:hi
//   umang:idx:{journeyId}:{persona}   (match index, built by scripts/build-umang-index.js)
//
// Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, ANTHROPIC_API_KEY
// Tune match strictness with UMANG_MATCH_THRESHOLD (default 0.55).

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const THRESHOLD = parseFloat(process.env.UMANG_MATCH_THRESHOLD || '0.55');
const SONNET = 'claude-sonnet-4-5';
const HAIKU = 'claude-haiku-4-5-20251001';

// Tier-2 "no ready answer" notice (shown as a modal on the page; not appended to the pane).
const NOTICE = 'मेरे पास इसका तैयार जवाब नहीं है। सही समाधान के लिए मैं ऑनलाइन देखता हूँ…';

const SCREENS = {
  balance: 'Check your account balance. Your available balance will be shown after UPI PIN verification. Balance enquiry is free. No money is moved.',
  p2p_small: 'Send ₹350 to Rahul Sharma via UPI (rahul@okaxis). Enter UPI PIN to confirm. Refund possible if sent to wrong UPI ID — contact bank within 24 hours.',
  p2p_large_unknown: 'Send ₹8,500 to an unknown, unverified UPI ID merchant8847@ybl. First time transfer. Irrevocable once sent.',
  p2m_qr: 'Pay verified merchant Fresh Mart Store ₹1,200 via QR scan. Enter UPI PIN to pay.',
  collect_unknown: 'Collect request from unknown UPI ID fraud_alert99@paytm for ₹15,000. Approving DEBITS money from YOUR account. Sender unverified. Irrevocable.',
  beneficiary_add: 'Add new beneficiary Unknown Trader, A/C ****7823, IFSC SBIN0001234. Once added, future transfers skip re-verification.',
  nach_mandate: 'Sign NACH e-Mandate. Creditor QuickLoan NBFC. Up to ₹25,000/month auto-debit for 3 years. Irrevocable for the mandate period.',
  autopay: 'Setup UPI AutoPay. Merchant StreamFlix Premium ₹599/month recurring without UPI PIN after first authorization. Cancel anytime from UPI app settings.',
  ekyc: 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data are shared with the service provider. Shares full name, address, photo, date of birth, Aadhaar number. Irrevocable — identity data cannot be recalled.',
  credit_line: 'Activate pre-approved credit line. Lender QuickCash NBFC. Limit ₹50,000 at 18% APR. EMI auto-debit. Late penalty ₹500 + interest. Reported to credit bureau.',
  ondc: 'Place order via ONDC open network. Seller KisanDirect Farm, Organic Rice 5kg, ₹450. Open network — dispute resolution differs from marketplace apps.',
  token_lock: 'Lock Land Parcel Token #LPT-4421 via Finternet unified ledger for 180 days. Cannot transfer, sell, or use as collateral during lock. Irrevocable for the lock duration.',
  aadhaar_sign: 'Sign Property Sale Agreement with Aadhaar e-Sign. Legally binding electronic signature, enforceable under IT Act 2000. Irrevocable; Aadhaar identity permanently linked to the document.',
};

const DIMS = {
  kya_likha_hai: 'COMPREHENSION. Explain plainly what this screen says and is asking the user to do — the key facts, data, amounts, and whether it can be undone. Help them simply understand what is written.',
  faida: 'ACTION / BENEFIT. Explain what the user gains or risks here and what they should do — is it worth it, what is the benefit versus the cost, and the practical next step.',
};

const PERSONA_PROFILE = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};
const VERBOSITY = { LOW: '40-60 words.', MEDIUM: '60-100 words.', HIGH: '100-150 words, cover every risk and number.' };

const PROVIDERS = {
  ekyc: { name: 'UIDAI', phone: '1947', email: 'help@uidai.gov.in', link: 'https://uidai.gov.in', fee: 'Aadhaar eKYC is free for residents', note: 'Aadhaar issuing authority' },
  aadhaar_sign: { name: 'UIDAI e-Sign', phone: '1947', email: 'help@uidai.gov.in', link: 'https://uidai.gov.in', fee: 'e-Sign fee set by the e-Sign Service Provider', note: '' },
  collect_unknown: { name: 'National Cyber Crime Helpline', phone: '1930', email: '', link: 'https://cybercrime.gov.in', fee: 'Reporting fraud is free', note: 'Report UPI fraud immediately' },
  p2p_large_unknown: { name: 'Cyber Crime Helpline / your bank', phone: '1930', email: '', link: 'https://cybercrime.gov.in', fee: '', note: 'For unauthorised/fraud transfers' },
  nach_mandate: { name: 'NPCI NACH', phone: '1800-120-1740', email: '', link: 'https://www.npci.org.in/what-we-do/nach/product-overview', fee: 'Mandate charges vary by bank [verify]', note: '[verify provider number]' },
  autopay: { name: 'NPCI UPI AutoPay', phone: '1800-120-1740', email: '', link: 'https://www.npci.org.in/what-we-do/upi/upi-autopay', fee: 'No NPCI fee; merchant sets the amount', note: '[verify]' },
  credit_line: { name: 'QuickCash NBFC [PLACEHOLDER]', phone: '[lender support number]', email: 'support@quickcash.example', link: 'https://example.com', fee: '18% APR, ₹500 late fee', note: 'PLACEHOLDER — replace with the real lender' },
  token_lock: { name: 'Finternet (concept) [PLACEHOLDER]', phone: '[NA]', email: '', link: 'https://example.com', fee: '', note: 'PLACEHOLDER' },
  beneficiary_add: { name: 'Your bank [PLACEHOLDER]', phone: '[bank support number]', email: '', link: '', fee: '', note: 'PLACEHOLDER' },
  ondc: { name: 'ONDC', phone: '', email: '', link: 'https://ondc.org', fee: '', note: 'Open network — the seller handles disputes' },
  p2p_small: { name: 'NPCI UPI / your bank', phone: '1800-120-1740', email: '', link: 'https://www.npci.org.in/what-we-do/upi/dispute-redressal-mechanism', fee: '', note: '[verify]' },
  p2m_qr: { name: 'NPCI UPI / your bank', phone: '1800-120-1740', email: '', link: 'https://www.npci.org.in/what-we-do/upi/dispute-redressal-mechanism', fee: '', note: '[verify]' },
  balance: { name: 'Your bank', phone: '[bank support number]', email: '', link: '', fee: 'Balance enquiry is free', note: 'PLACEHOLDER' },
};

// ── NLP tokenizer (keeps Devanagari combining marks) ──────────────────────────
const STOP = new Set(('the a an is are was of to in on for and or that this it me my you your i we what how do does '
  + 'ye yeh kya hai ka ki ke ko se me mein hi bhi to na nahi ha haan aur ya jo wo woh is us ek hona kar karu karna '
  + 'है हैं का की के को से में ये यह क्या कैसे और या जो वो वह इस उस एक मैं मेरा आप कर करना है').split(/\s+/));
function tokenize(s) {
  return (s || '').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(t => t && !STOP.has(t) && t.length > 1);
}
function extractKeywords(s) {
  const seen = new Set(), out = [];
  for (const t of tokenize(s)) { if (!seen.has(t)) { seen.add(t); out.push(t); } }
  return out;
}

// Indexed scoring: query vs prebuilt index blob → ranked docs
function rankWithIndex(query, idx) {
  const qt = tokenize(query); const qtf = {}; qt.forEach(t => qtf[t] = (qtf[t] || 0) + 1);
  const qvec = {}; let qsum = 0;
  for (const t in qtf) { const w = qtf[t] * (idx.idf[t] != null ? idx.idf[t] : idx.defaultIdf); qvec[t] = w; qsum += w * w; }
  const qnorm = Math.sqrt(qsum) || 1e-9;
  return idx.docs.map(d => {
    let dot = 0; for (const t in qvec) if (d.vec[t]) dot += qvec[t] * d.vec[t];
    return { key: d.key, dim: d.dim, verbosity: d.verbosity, text: d.text, score: dot / (qnorm * d.norm) };
  }).sort((a, b) => b.score - a.score);
}
// Fallback on-the-fly scoring when no index exists yet
function rankOnTheFly(query, docs) {
  const qTokens = tokenize(query); const docTokens = docs.map(d => tokenize(d.text));
  const N = docs.length + 1, df = {};
  [qTokens, ...docTokens].forEach(toks => new Set(toks).forEach(t => df[t] = (df[t] || 0) + 1));
  const idf = t => Math.log(N / (1 + (df[t] || 0))) + 1;
  const tf = toks => { const m = {}; toks.forEach(t => m[t] = (m[t] || 0) + 1); return m; };
  const vec = toks => { const f = tf(toks), v = {}; for (const t in f) v[t] = f[t] * idf(t); return v; };
  const dot = (a, b) => { let s = 0; for (const t in a) if (b[t]) s += a[t] * b[t]; return s; };
  const norm = a => Math.sqrt(dot(a, a)) || 1e-9;
  const qv = vec(qTokens);
  return docs.map((d, i) => { const dv = vec(docTokens[i]); return { ...d, score: dot(qv, dv) / (norm(qv) * norm(dv)) }; }).sort((a, b) => b.score - a.score);
}

async function cacheGet(key) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
    if (!r.ok) return null;
    const d = await r.json(); if (!d.result) return null;
    let p = JSON.parse(d.result); if (typeof p === 'string') p = JSON.parse(p); return p;
  } catch { return null; }
}
async function cacheSet(key, entry) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(JSON.stringify(entry)),
    });
  } catch {}
}
async function claude(model, prompt, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens || 500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error('Claude ' + r.status);
  const d = await r.json(); return d.content?.[0]?.text?.trim() || '';
}
function speakable(text) {
  let t = text.replace(/https?:\/\/[^\s)]+/g, 'नीचे दिया गया लिंक दबाएँ');
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'दिया गया ईमेल पता दबाएँ');
  return t;
}
function dimKey(journey, dim, persona, verbosity) { return `umang:${journey}:${dim}:${persona}:${verbosity}:hi`; }
async function generateDim(journey, dim, personaSlug, verb) {
  const prompt = `You are GATO, the DPIx Journey Intelligence agent, talking to the user about a financial consent screen in the Umang-style app.

SCREEN: ${SCREENS[journey] || SCREENS.ekyc}
PERSONA: ${PERSONA_PROFILE[personaSlug] || PERSONA_PROFILE.rajan}
FOCUS: ${DIMS[dim] || DIMS.kya_likha_hai}
LENGTH: ${VERBOSITY[verb] || VERBOSITY.MEDIUM}
LANGUAGE: Hindi, Devanagari only. Conversational, spoken register, no filler. Output ONLY the spoken words.`;
  return claude(SONNET, prompt, 700);
}
async function liveAnswer(journey, q) {
  const p = PROVIDERS[journey] || {};
  const facts = [
    p.name && `Provider: ${p.name}`, p.phone && `Support phone: ${p.phone}`, p.email && `Email: ${p.email}`,
    p.fee && `Fee: ${p.fee}`, p.link && `Reference link: ${p.link}`, p.note && `Note: ${p.note}`,
  ].filter(Boolean).join('\n');
  const prompt = `The user asked a follow-up the cache could not answer. Compose a short helpful Hindi (Devanagari) answer using ONLY the provider facts below. If a phone/email/link is relevant, include it verbatim. 2-4 sentences, spoken register, no filler.

USER QUESTION: "${q}"
SCREEN: ${SCREENS[journey]}
PROVIDER FACTS:
${facts || 'No provider data on file.'}

Output ONLY the spoken answer.`;
  const answer = await claude(SONNET, prompt, 500);
  return { answer, provider: p };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const t0 = Date.now();
  const body = req.body || {};
  const journey = SCREENS[body.journeyId] ? body.journeyId : 'ekyc';
  const persona = PERSONA_PROFILE[body.persona] ? body.persona : 'rajan';
  const verb = VERBOSITY[body.verbosity] ? body.verbosity : 'MEDIUM';
  const mode = ['followon', 'live'].includes(body.mode) ? body.mode : 'compare';

  try {
    // ───────── COMPARE ─────────
    if (mode === 'compare') {
      const dim = DIMS[body.dim] ? body.dim : 'kya_likha_hai';
      const key = dimKey(journey, dim, persona, verb);
      if (!body.nocache) {
        const hit = await cacheGet(key);
        if (hit && hit.script) return res.status(200).json({ tier: 1, source: 'cache', dim, script: hit.script, tts: speakable(hit.script), cache_key: key, journeyId: journey, latency_ms: Date.now() - t0 });
      }
      const script = await generateDim(journey, dim, persona, verb);
      if (!body.nocache && script) await cacheSet(key, { script, dim, journey, persona, verbosity: verb, language: 'hi', generated_at: new Date().toISOString(), model: SONNET, tier: 1 });
      return res.status(200).json({ tier: 2, source: 'live', dim, script, tts: speakable(script), cache_key: key, journeyId: journey, latency_ms: Date.now() - t0 });
    }

    // ───────── LIVE (phase 2 of a follow-on) ─────────
    if (mode === 'live') {
      const q = (body.transcript || '').trim();
      const { answer, provider } = await liveAnswer(journey, q);
      return res.status(200).json({ tier: 2, source: 'live', script: answer, tts: speakable(answer), notice: NOTICE, provider, journeyId: journey, latency_ms: Date.now() - t0 });
    }

    // ───────── FOLLOW-ON (phase 1: indexed match) ─────────
    const q = (body.transcript || '').trim();
    const exclude = Array.isArray(body.exclude) ? body.exclude : [];
    const repeatAsked = /\b(repeat|dobara|dubara|phir se|fir se|firse|samajh nahi|samjha nahi|nahi samjha|didn'?t understand|samajh)\b/i.test(q)
      || /फिर से|दोबारा|समझ नहीं|दुबारा/.test(q);

    let ranked = [];
    const idx = await cacheGet(`umang:idx:${journey}:${persona}`);
    if (idx && idx.docs && idx.docs.length) {
      ranked = rankWithIndex(q, idx);
    } else {
      const cand = [];
      for (const dim of Object.keys(DIMS)) for (const v of Object.keys(VERBOSITY)) {
        const key = dimKey(journey, dim, persona, v);
        const hit = await cacheGet(key);
        if (hit && hit.script) cand.push({ key, dim, text: hit.script });
      }
      if (cand.length) ranked = rankOnTheFly(q, cand);
    }
    const keywords = extractKeywords(q);
    const best = ranked.filter(c => repeatAsked || !exclude.includes(c.key))[0] || null;

    if (best && best.score >= THRESHOLD) {
      const prompt = `Rephrase the cached explanation below to directly answer the user's follow-up. Keep the SAME facts and meaning — do not add new claims. Hindi, Devanagari only, 2-4 sentences, spoken register.

USER FOLLOW-UP: "${q}"
CACHED EXPLANATION: ${best.text}

Output ONLY the reworded spoken answer.`;
      const script = await claude(HAIKU, prompt, 400).catch(() => best.text);
      return res.status(200).json({
        tier: 1, source: 'cache-rephrased', dim: best.dim, match_score: Number(best.score.toFixed(3)),
        keywords, matched_key: best.key, script, tts: speakable(script), journeyId: journey, latency_ms: Date.now() - t0,
      });
    }

    // No good match → tell the page to show the modal + call mode:'live'. No LLM here (fast).
    return res.status(200).json({
      tier: 2, needLive: true, notice: NOTICE, source: 'live',
      match_score: best ? Number(best.score.toFixed(3)) : 0, keywords, journeyId: journey, latency_ms: Date.now() - t0,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message, journeyId: journey });
  }
}
