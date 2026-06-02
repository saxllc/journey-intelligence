export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    // Read raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    // Forward to Sarvam STT as multipart form
    const boundary = '----SarvamBoundary' + Date.now();
    const formParts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
      body,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nsaaras:v3`,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\nunknown`,
      `\r\n--${boundary}--\r\n`,
    ];

    const formBody = Buffer.concat(formParts.map(p => typeof p === 'string' ? Buffer.from(p) : p));

    const r = await fetch('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody,
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: 'Sarvam STT error', detail: err });
    }

    const data = await r.json();
    return res.status(200).json({
      transcript: data.transcript || '',
      language: data.language_code || 'unknown',
    });
  } catch (e) {
    return res.status(500).json({ error: 'STT error', detail: e.message });
  }
}
