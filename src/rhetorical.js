require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// src/rhetorical.js
// Rhetorical Layer Generator

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function generateRhetoricalLayer(step, context = {}) {
  const client = getClient();
  const {
    language = 'en',
    userProfile = 'first-time',
    materiality = 'TRANSACTIONAL',
    appName = 'this application'
  } = context;

  const prompt = `You are a Journey Intelligence engine. Generate a rhetorical comprehension layer for a UI step.

CANONICAL STEP:
${JSON.stringify(step, null, 2)}

CONTEXT:
- Output language: ${language}
- User profile: ${userProfile}
- Materiality: ${materiality}
- App name: ${appName}

Return a single JSON object. No markdown. No explanation. No wrapper text. Only JSON.

{
  "headline": "Action-oriented label, max 8 words",
  "plain_explanation": "What this step does, 1-2 sentences, no jargon, language: ${language}",
  "what_happens_next": "What the user should expect after completing this step",
  "kya_likha_hai_script": "Conversational audio script in ${language}, max 35 words. Reads aloud naturally.",
  "risk_signal": null,
  "help_nudge": "One tip for first-time users, or null if not needed",
  "confidence_phrase": "Short completion confirmation phrase"
}

For risk_signal: set to a one-line warning string only if materiality is CONSEQUENTIAL, else null.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = response.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`Rhetorical layer parse failed: ${e.message}\nRaw: ${raw}`);
    }
  }
}

async function generateFlowRhetoricalLayer(flow, context = {}) {
  const results = [];
  for (const step of flow.steps) {
    const rhetorical = await generateRhetoricalLayer(step, {
      ...context,
      materiality: step.materiality || 'TRANSACTIONAL'
    });
    results.push({
      step_id: step.id,
      canonical: step,
      rhetorical
    });
  }
  return results;
}

module.exports = { generateRhetoricalLayer, generateFlowRhetoricalLayer };
