// demo/server.js
// Express server — proxies all API calls, serves demo/index.html

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
console.log('KEY CHECK:', process.env.ANTHROPIC_API_KEY?.slice(0,15));
const express = require('express');
const path = require('path');

const { classify } = require('../src/classify');
const { generateRhetoricalLayer } = require('../src/rhetorical');
const { generateAudio, toAudioDataURI } = require('../src/kya-likha-hai');
const { generateConfidenceArtefact } = require('../src/confidence-artefact');
const { generateCASGate } = require('../src/cas-gate');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.post('/api/debug-key', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.json({ prefix: key.slice(0, 30), suffix: key.slice(-10), length: key.length });
});

app.post('/api/classify', (req, res) => {
  try {
    res.json(classify(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/rhetorical', async (req, res) => {
  try {
    const { step, context } = req.body;
    const result = await generateRhetoricalLayer(step, context || {});
    console.log('API call succeeded');
    res.json(result);
  } catch (e) {
    console.log('API call failed:', e.status, e.message, e.error);
    console.error('Rhetorical error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kya-likha-hai', async (req, res) => {
  try {
    const { text, language } = req.body;
    const result = await generateAudio(text, language || 'hi');
    res.json({
      ...result,
      data_uri: toAudioDataURI(result.audio_base64)
    });
  } catch (e) {
    console.error('KLH error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/confidence-artefact', (req, res) => {
  try {
    const { transaction, options } = req.body;
    res.json(generateConfidenceArtefact(transaction, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/cas-gate', (req, res) => {
  try {
    const { step, options } = req.body;
    res.json(generateCASGate(step, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Config endpoints — read/write to Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

app.get('/api/config', async (req, res) => {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/configurations?id=eq.active&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await r.json();
    res.json(data[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', async (req, res) => {
  try {
    const payload = { ...req.body, id: 'active', updated_at: new Date().toISOString() };
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/configurations?id=eq.active`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    );
    const data = await r.json();
    res.json(data[0] || payload);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's', time: new Date().toISOString() });
});

app.post('/api/restart', (req, res) => {
  res.json({ status: 'restarting' });
  setTimeout(() => process.exit(0), 300);
});

app.post('/api/klh-script', async (req, res) => {
  try {
    const { screen_content, persona_profile, language } = req.body;
    const client = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: `You are GATO, the DPIx Journey Intelligence agent. Generate a comprehensive audio explanation script for the screen content below.

SCREEN CONTENT:
${screen_content}

PERSONA: ${persona_profile}
LANGUAGE INSTRUCTION: ${langInstruction}

const LANG_INSTRUCTION = {
  hi: 'Hindi — write ONLY in Devanagari script (हिंदी). No Roman/English transliteration. Example: "aapki zameen" is WRONG, "आपकी ज़मीन" is CORRECT.',
  en: 'English — write in plain English only.',
  kn: 'Kannada — write ONLY in Kannada script (ಕನ್ನಡ). No transliteration.',
  ta: 'Tamil — write ONLY in Tamil script (தமிழ்). No transliteration.'
};
const langInstruction = LANG_INSTRUCTION[language] || LANG_INSTRUCTION.hi;

Rules:
- Write 30-150 words minimum. Cover ALL content on screen — do not skip or summarize briefly.
- Use the exact language specified. For Hindi use colloquial spoken Hindi, not formal.
- For CONSEQUENTIAL steps: explain every risk, every number, every term clearly.
- For backend view: explain what each technical field means in plain language.
- For success/failure screens: explain what happened, why, and what comes next.
- Write as natural spoken audio — no bullet points, no headers, just flowing speech.
- End with a reassuring or action-oriented closing line.

Return ONLY the script text. No JSON. No labels. Just the words to be spoken.` }]
    });
    res.json({ script: response.content[0].text.trim() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ADD THESE TWO ENDPOINTS to demo/server.js ──────────────
// Paste BEFORE the line: app.use(express.static(path.join(__dirname)));

// TTS with explicit speaker — bypasses kya-likha-hai.js random speaker
app.post('/api/tts', async (req, res) => {
  try {
    const { text, language, speaker } = req.body;
    const VALID = ['anushka','abhilash','manisha','vidya','arya','karun','hitesh'];
    const spk = VALID.includes(speaker) ? speaker : 'anushka';
    const langMap = { hi:'hi-IN', en:'en-IN', kn:'kn-IN', ta:'ta-IN' };
    const langCode = langMap[language] || 'hi-IN';
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'api-subscription-key': process.env.SARVAM_API_KEY },
      body: JSON.stringify({ inputs:[text], target_language_code:langCode, speaker:spk, model:'bulbul:v2' })
    });
    if (!r.ok) { const e = await r.text(); throw new Error('Sarvam '+r.status+': '+e); }
    const data = await r.json();
    const audio = data.audios?.[0];
    if (!audio) throw new Error('No audio in Sarvam response');
    res.json({ audio_base64:audio, data_uri:`data:audio/wav;base64,${audio}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// KLH script generation with verbosity control
app.post('/api/klh-script', async (req, res) => {
  try {
    const { screen_content, persona_profile, language, verbosity } = req.body;
    const VERBOSITY = {
      LOW:    'Write 40-60 words total. Short sentences under 12 words. Most important point only.',
      MEDIUM: 'Write 60-100 words total. Cover the key points clearly.',
      HIGH:   'Write 100-150 words minimum. Cover ALL content on screen — every risk, every number, every term. Leave nothing out.'
    };
    const vInstruction = VERBOSITY[verbosity] || VERBOSITY.MEDIUM;
    const client = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:'claude-sonnet-4-5', max_tokens:1200,
      messages:[{ role:'user', content:`You are GATO, the DPIx Journey Intelligence agent. Generate an audio explanation script.

SCREEN CONTENT:
${screen_content}

PERSONA: ${persona_profile}
LANGUAGE: ${language}
LENGTH INSTRUCTION: ${vInstruction}

Rules:
- Use the exact language specified. Hindi: colloquial spoken, not formal.
- For CONSEQUENTIAL steps: explain every risk, number, and term.
- For backend view: explain each technical field in plain language.
- Write as natural spoken audio — no bullets, no headers, flowing speech.
- End with a reassuring or action-oriented closing line.

Return ONLY the script text. No JSON. No labels.` }]
    });
    res.json({ script: response.content[0].text.trim() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Applicationator demo`);
  console.log(` http://localhost:${PORT}\n`);
});
