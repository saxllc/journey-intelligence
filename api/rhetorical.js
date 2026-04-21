export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { step, context } = req.body;

  if (!step || !context) {
    return res.status(400).json({ error: 'Missing required fields: step, context' });
  }

  const { language, userProfile, materiality, appName } = context;

  const prompt = `You are a Journey Intelligence layer for ${appName || 'a financial application'}.

A user is at this step:
${JSON.stringify(step, null, 2)}

User profile: ${userProfile}
Language: ${language}
Materiality level: ${materiality}

Generate a comprehension layer for this step. Respond ONLY with valid JSON, no markdown, no explanation:
{
  "headline": "short plain-language title for this step (max 8 words, in ${language})",
  "plain_explanation": "what this step means for the user in simple terms (2-3 sentences, in ${language})",
  "risk_signal": "key risk or consequence the user must know, or null if none",
  "what_happens_next": "one sentence on what happens after this step, in ${language}",
  "help_nudge": "one practical tip to help the user proceed confidently, or null"
}`;

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
    const raw = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return res.status(500).json({ error: 'Claude returned non-JSON', raw });
    }

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
