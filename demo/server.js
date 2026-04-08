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

app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Journey Intelligence demo`);
  console.log(` http://localhost:${PORT}\n`);
});
