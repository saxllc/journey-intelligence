// ── Tier 1 cache lookup helpers ──────────────────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Map persona_profile strings (as sent by HTML) to cache key slugs
function resolvePersona(profile) {
  if (!profile) return null;
  const p = profile.toLowerCase();
  if (p.includes('genz') || p.includes('hinglish') || p.includes('mumbai')) return 'arjun';
  if (p.includes('farmer') || p.includes('vidarbha') || p.includes('rajan')) return 'rajan';
  if (p.includes('migrant') || p.includes('sunita') || p.includes('worker')) return 'sunita';
  // Also accept direct slug
  if (['arjun', 'rajan', 'sunita'].includes(p)) return p;
  return null;
}

// Map language (short code or full instruction string) to cache key
function resolveLang(lang) {
  if (!lang) return null;
  if (['hi', 'en', 'kn', 'ta'].includes(lang)) return lang;
  const l = lang.toLowerCase();
  if (l.includes('hindi') || l.includes('devanagari')) return 'hi';
  if (l.includes('english')) return 'en';
  if (l.includes('kannada')) return 'kn';
  if (l.includes('tamil')) return 'ta';
  return null;
}

// Extract journey ID from screen_content by matching known screen text fragments
const JOURNEY_FINGERPRINTS = [
  { id: 'collect_unknown', fragment: 'collect request' },
  { id: 'nach_mandate', fragment: 'nach e-mandate' },
  { id: 'autopay', fragment: 'upi autopay' },
  { id: 'ekyc', fragment: 'ekyc with aadhaar' },
  { id: 'credit_line', fragment: 'credit line' },
  { id: 'token_lock', fragment: 'finternet unified ledger' },
  { id: 'aadhaar_sign', fragment: 'aadhaar digital signature' },
  { id: 'p2p_large_unknown', fragment: 'unknown contact' },
  { id: 'beneficiary_add', fragment: 'add new beneficiary' },
  { id: 'ondc', fragment: 'ondc open network' },
  { id: 'p2m_qr', fragment: 'pay merchant via qr' },
  { id: 'p2p_small', fragment: 'send ₹350' },
  { id: 'balance', fragment: 'check your account balance' },
];

function resolveJourney(screenContent) {
  if (!screenContent) return null;
  const lower = screenContent.toLowerCase();
  for (const j of JOURNEY_FINGERPRINTS) {
    if (lower.includes(j.fragment)) return j.id;
  }
  return null;
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
    // Handle double-encoded JSON from generation script
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed;
  } catch { return null; }
}

// ── Main handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { screen_content, persona_profile, language, verbosity, nocache } = req.body;

  if (!screen_content || !persona_profile || !language) {
    return res.status(400).json({ error: 'Missing required fields: screen_content, persona_profile, language' });
  }

  // ── Tier 1: cache lookup (skip if nocache flag set) ────────
  const journeyId = resolveJourney(screen_content);
  const personaSlug = resolvePersona(persona_profile);
  const langCode = resolveLang(language);
  const vLevel = verbosity || 'MEDIUM';

  if (!nocache && journeyId && personaSlug && langCode) {
    const cacheKey = `klh:${journeyId}:${personaSlug}:${vLevel}:${langCode}`;
    const cached = await cacheGet(cacheKey);
    if (cached && cached.script) {
      return res.status(200).json({
        script: cached.script,
        source: 'cache',
        tier: 1,
        cache_key: cacheKey,
        latency_hint: '<50ms',
      });
    }
  }

  // ── Tier 2: live Claude generation (cache miss) ────────────
  const LANG_INSTRUCTION = {
    hi: 'Hindi — write ONLY in Devanagari script. No Roman/English letters at all. Wrong: "aapki zameen". Correct: "आपकी ज़मीन". Every single word must be in Devanagari.',
    en: 'English — write in plain English only. No other script.',
    kn: 'Kannada — write ONLY in Kannada script ಕನ್ನಡ. No Roman transliteration at all.',
    ta: 'Tamil — write ONLY in Tamil script தமிழ். No Roman transliteration at all.'
  };
  const langInstruction = LANG_INSTRUCTION[language] || language;

  const VERBOSITY = {
    LOW:    'Write 40-60 words total. Short sentences. Most important point only.',
    MEDIUM: 'Write 60-100 words total. Cover key points clearly.',
    HIGH:   'Write 100-150 words minimum. Cover ALL content — every risk, every number, every term. Leave nothing out.'
  };
  const vInstruction = VERBOSITY[verbosity] || VERBOSITY.MEDIUM;

  const prompt = `You are GATO, the DPIx Journey Intelligence agent. Generate an audio explanation script.

SCREEN CONTENT:
${screen_content}

PERSONA: ${persona_profile}

LANGUAGE INSTRUCTION: ${langInstruction}

LENGTH INSTRUCTION: ${vInstruction}

Rules:
- Follow the LANGUAGE INSTRUCTION exactly. This is the most important rule.
- Use colloquial spoken register, not formal written register.
- For CONSEQUENTIAL steps: explain every risk, number, and term.
- For backend view: explain each technical field in plain human language.
- Write as natural spoken audio — no bullets, no headers, flowing speech only.
- End with a reassuring or action-oriented closing line.

Return ONLY the script text. No JSON. No labels. No explanation. Just the words to be spoken.`;

  const t0 = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: 'Claude API error', detail: errText });
    }

    const data = await r.json();
    const script = data.content?.[0]?.text?.trim() || '';

    return res.status(200).json({
      script,
      source: 'live',
      tier: 2,
      latency_ms: Date.now() - t0,
    });

  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
