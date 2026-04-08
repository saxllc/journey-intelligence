const { generateAudio, toAudioDataURI } = require('../src/kya-likha-hai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
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
};
