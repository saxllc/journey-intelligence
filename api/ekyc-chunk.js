const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Intent patterns — keyword → chunk mapping
const INTENT_MAP = [
  { id: 'data_shared', patterns: ['data', 'share', 'jaankari', 'kya share', 'information', 'details', 'naam', 'pata', 'photo', 'address', 'name'] },
  { id: 'reversibility', patterns: ['wapas', 'cancel', 'undo', 'reverse', 'ruk', 'rok', 'hatao', 'vapas', 'back', 'return', 'irrevers'] },
  { id: 'biometric', patterns: ['ungali', 'finger', 'iris', 'biometric', 'scan', 'nishaan', 'anguli', 'aankh'] },
  { id: 'consequence', patterns: ['kya hoga', 'what happen', 'result', 'agar', 'hoga', 'baad', 'after', 'then what', 'phir'] },
  { id: 'who_gets_data', patterns: ['kaun', 'company', 'kis ko', 'who', 'provider', 'kisko', 'konsa'] },
  { id: 'alternative', patterns: ['aur koi', 'other', 'option', 'alternative', 'bina', 'without', 'dusra', 'tarika'] },
  { id: 'safety', patterns: ['safe', 'surakshit', 'khatarnak', 'danger', 'risk', 'dhoka', 'fraud', 'sahi', 'galat', 'thik'] },
  { id: 'action', patterns: ['kya karu', 'what do', 'aage', 'proceed', 'karu', 'should i', 'karna chahiye', 'haan', 'nahi', 'yes', 'no'] },
  { id: 'overview', patterns: ['samjhao', 'explain', 'kya hai', 'what is', 'batao', 'bolo', 'shuru', 'start', 'ekyc'] },
];

function matchIntent(transcript) {
  if (!transcript) return 'overview';
  const lower = transcript.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;
  for (const intent of INTENT_MAP) {
    let score = 0;
    for (const p of intent.patterns) {
      if (lower.includes(p)) score++;
    }
    if (score > bestScore) { bestScore = score; bestMatch = intent.id; }
  }
  return bestMatch || null;
}

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { transcript, persona } = req.body;
  const personaSlug = persona || 'rajan';
  const intentId = matchIntent(transcript);

  if (intentId) {
    const key = `klh:ekyc:chunk:${intentId}:${personaSlug}:hi`;
    const cached = await cacheGet(key);
    if (cached && cached.script) {
      return res.status(200).json({
        script: cached.script,
        intent: intentId,
        source: 'cache',
        cache_key: key,
      });
    }
  }

  // Tier 2 fallback — live generation for unmatched intents
  try {
    const prompt = `You are GATO, the DPIx Journey Intelligence agent. The user is on an eKYC Aadhaar consent screen and asked: "${transcript}"

SCREEN: Complete eKYC with Aadhaar. Your Aadhaar number and biometric data will be shared. eKYC is irrevocable.

PERSONA: ${personaSlug === 'arjun' ? 'GenZ Mumbai, Hinglish, casual' : personaSlug === 'sunita' ? 'Migrant worker, colloquial Hindi, simple' : 'Farmer Vidarbha, Hindi, grade 4'}

Respond in 2-3 sentences in Hindi DEVANAGARI ONLY. Conversational, direct, no filler. Output ONLY the spoken words.`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error('Claude ' + r.status);
    const data = await r.json();
    return res.status(200).json({
      script: data.content?.[0]?.text?.trim() || '',
      intent: 'unknown',
      source: 'live',
      original_query: transcript,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
