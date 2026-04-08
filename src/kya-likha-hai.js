// src/kya-likha-hai.js
// Kya Likha Hai — Audio Explanation Engine

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

const LANGUAGE_CODES = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  ml: 'ml-IN',
  or: 'or-IN',
  pa: 'pa-IN'
};

const SPEAKERS = ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'];

async function generateAudio(text, language = 'hi', options = {}) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error('SARVAM_API_KEY not set in .env');

  const langCode = LANGUAGE_CODES[language] || 'hi-IN';

  const payload = {
    inputs: [text],
    target_language_code: langCode,
    speaker: options.speaker || SPEAKERS[Math.floor(Math.random() * SPEAKERS.length)],
    pitch: options.pitch ?? 0,
    pace: options.pace ?? 1.0,
    loudness: options.loudness ?? 1.5,
    speech_sample_rate: 22050,
    enable_preprocessing: true,
    model: 'bulbul:v2'
  };

  const response = await fetch(SARVAM_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam TTS ${response.status}: ${errText}`);
  }

  const data = await response.json();

  return {
    audio_base64: data.audios[0],
    language: langCode,
    text,
    format: 'wav'
  };
}

function toAudioDataURI(base64Audio) {
  return `data:audio/wav;base64,${base64Audio}`;
}

async function generateAudioURI(text, language = 'hi', options = {}) {
  const result = await generateAudio(text, language, options);
  return toAudioDataURI(result.audio_base64);
}

module.exports = { generateAudio, toAudioDataURI, generateAudioURI, LANGUAGE_CODES };
