export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, language, speaker } = req.body;

  if (!text || !language || !speaker) {
    return res.status(400).json({ error: 'Missing required fields: text, language, speaker' });
  }

  try {
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: language,
        speaker_name: speaker,
        model: 'bulbul:v2'
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: 'Sarvam API error', detail: errText });
    }

    const data = await r.json();

    if (!data.audios || !data.audios[0]) {
      return res.status(500).json({ error: 'No audio returned from Sarvam' });
    }

    // Return in the same shape the HTML files already expect
    return res.status(200).json({
      data_uri: 'data:audio/wav;base64,' + data.audios[0]
    });

  } catch (e) {
    return res.status(500).json({ error: 'Internal error', detail: e.message });
  }
}
