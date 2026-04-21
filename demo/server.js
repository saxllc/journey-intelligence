// demo/server.js
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

// CORS — allow all origins, required for phone accessing via ngrok
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Debug ─────────────────────────────────────────────────
app.post('/api/debug-key', (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY || '';
  res.json({ prefix: key.slice(0, 30), suffix: key.slice(-10), length: key.length });
});

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) + 's', time: new Date().toISOString() });
});

// ── Restart (used by configurator restart button via PM2) ─
app.post('/api/restart', (req, res) => {
  res.json({ status: 'restarting' });
  setTimeout(() => process.exit(0), 300);
});

// ── Classify ──────────────────────────────────────────────
app.post('/api/classify', (req, res) => {
  try {
    res.json(classify(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Rhetorical layer (Claude) ─────────────────────────────
app.post('/api/rhetorical', async (req, res) => {
  try {
    const { step, context } = req.body;
    const result = await generateRhetoricalLayer(step, context || {});
    console.log('Rhetorical API call succeeded');
    res.json(result);
  } catch (e) {
    console.error('Rhetorical error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── KLH Script — deep Claude generation with verbosity + correct script ──
app.post('/api/klh-script', async (req, res) => {
  try {
    const { screen_content, persona_profile, language, verbosity } = req.body;

    // Explicit script instruction per language — prevents transliteration
    const LANG_INSTRUCTION = {
      hi: 'Hindi — write ONLY in Devanagari script. No Roman/English letters at all. Wrong: "aapki zameen". Correct: "आपकी ज़मीन". Every single word must be in Devanagari.',
      en: 'English — write in plain English only. No other script.',
      kn: 'Kannada — write ONLY in Kannada script ಕನ್ನಡ. No Roman transliteration at all.',
      ta: 'Tamil — write ONLY in Tamil script தமிழ். No Roman transliteration at all.'
    };
    const langInstruction = LANG_INSTRUCTION[language] || LANG_INSTRUCTION.hi;

    const VERBOSITY = {
      LOW:    'Write 40-60 words total. Short sentences. Most important point only.',
      MEDIUM: 'Write 60-100 words total. Cover key points clearly.',
      HIGH:   'Write 100-150 words minimum. Cover ALL content — every risk, every number, every term. Leave nothing out.'
    };
    const vInstruction = VERBOSITY[verbosity] || VERBOSITY.MEDIUM;

    const client = new (require('@anthropic-ai/sdk'))({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: `You are GATO, the DPIx Journey Intelligence agent. Generate an audio explanation script.

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

Return ONLY the script text. No JSON. No labels. No explanation. Just the words to be spoken.` }]
    });
    res.json({ script: response.content[0].text.trim() });
  } catch (e) {
    console.error('KLH script error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── TTS with explicit speaker (locked per session) ────────
app.post('/api/tts', async (req, res) => {
  try {
    const { text, language, speaker } = req.body;
    const VALID_SPEAKERS = ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'];
    const spk = VALID_SPEAKERS.includes(speaker) ? speaker : 'anushka';
    const LANG_MAP = { hi: 'hi-IN', en: 'en-IN', kn: 'kn-IN', ta: 'ta-IN' };
    const langCode = LANG_MAP[language] || 'hi-IN';
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY
      },
      body: JSON.stringify({ inputs: [text], target_language_code: langCode, speaker: spk, model: 'bulbul:v2' })
    });
    if (!r.ok) {
      const errText = await r.text();
      throw new Error('Sarvam ' + r.status + ': ' + errText);
    }
    const data = await r.json();
    const audio = data.audios?.[0];
    if (!audio) throw new Error('No audio in Sarvam response');
    res.json({ audio_base64: audio, data_uri: `data:audio/wav;base64,${audio}` });
  } catch (e) {
    console.error('TTS error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Legacy KYA LIKHA HAI (random speaker, kept for backward compat) ───────
app.post('/api/kya-likha-hai', async (req, res) => {
  try {
    const { text, language } = req.body;
    const result = await generateAudio(text, language || 'hi');
    res.json({ ...result, data_uri: toAudioDataURI(result.audio_base64) });
  } catch (e) {
    console.error('KLH audio error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Confidence artefact ───────────────────────────────────
app.post('/api/confidence-artefact', (req, res) => {
  try {
    const { transaction, options } = req.body;
    res.json(generateConfidenceArtefact(transaction, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── CAS gate ──────────────────────────────────────────────
app.post('/api/cas-gate', (req, res) => {
  try {
    const { step, options } = req.body;
    res.json(generateCASGate(step, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Supabase config read/write ────────────────────────────
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Static files ──────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Applicationator demo`);
  console.log(` http://localhost:${PORT}\n`);
});
