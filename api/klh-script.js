export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { screen_content, persona_profile, language, verbosity } = req.body;

  if (!screen_content || !persona_profile || !language) {
    return res.status(400).json({ error: 'Missing required fields: screen_content, persona_profile, language' });
  }

  const verbosityMap = {
    LOW: 'in 1-2 short sentences',
    MEDIUM: 'in 3-4 sentences',
    HIGH: 'in 5-6 sentences with full explanation'
  };
  const verbosityInstruction = verbosityMap[verbosity] || verbosityMap.MEDIUM;

  // language field already contains script enforcement from the HTML caller
  // e.g. "Hindi — USE DEVANAGARI SCRIPT ONLY, never Roman/Latin transliteration"
  const prompt = `You are KLH (Kya Likha Hai), an AI reading assistant for Indian citizens.

A user is looking at this screen:
${screen_content}

User profile: ${persona_profile}
Language instruction: ${language}
Verbosity: ${verbosity}

Write a plain-language narration script ${verbosityInstruction} that explains what this screen is asking the user to do.
Rules:
- STRICTLY follow the language instruction above including the script requirement.
- If the instruction says DEVANAGARI, every Hindi word must be in Devanagari Unicode. Zero Roman/Latin letters for Hindi words.
- If the instruction says KANNADA SCRIPT, write only in Kannada Unicode.
- If the instruction says TAMIL SCRIPT, write only in Tamil Unicode.
- Match vocabulary and literacy level to the user profile.
- Focus on what the user must decide or do, and any risk or consequence.
- Write as natural spoken words. No bullet points.
- Output ONLY the script. No preamble, no explanation, no quotes.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: 'Claude API error', detail: errText });
    }

    const data = await r.json();
    const script = data.content?.[0]?.text || '';

    return res.status(200).json({ script });

  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
