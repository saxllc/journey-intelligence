export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { screen_content, persona_profile, language, verbosity } = req.body;

  if (!screen_content || !persona_profile || !language) {
    return res.status(400).json({ error: 'Missing required fields: screen_content, persona_profile, language' });
  }

  // Explicit script instruction per language — prevents romanization
  const LANG_INSTRUCTION = {
    hi: 'Hindi — write ONLY in Devanagari script. No Roman/English letters at all. Wrong: "aapki zameen". Correct: "आपकी ज़मीन". Every single word must be in Devanagari.',
    en: 'English — write in plain English only. No other script.',
    kn: 'Kannada — write ONLY in Kannada script ಕನ್ನಡ. No Roman transliteration at all.',
    ta: 'Tamil — write ONLY in Tamil script தமிழ். No Roman transliteration at all.'
  };
  // language may be a short code (hi/en/kn/ta) or a full instruction string from the HTML
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

    return res.status(200).json({ script });

  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
