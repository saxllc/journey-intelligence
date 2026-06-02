/**
 * Generate eKYC conversational chunks for duplex PoC.
 * 9 chunks × 3 personas × Hindi = 27 entries.
 * Stored in Redis as klh:ekyc:chunk:{chunkId}:{persona}:hi
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const CHUNKS = [
  { id: 'overview', prompt: 'Explain what eKYC is and what this screen is asking the user to do. Keep it simple — the user has just opened the screen and needs a quick orientation.' },
  { id: 'data_shared', prompt: 'Explain exactly what personal data will be shared: full name, home address, photograph, date of birth, and Aadhaar number. Make each item concrete and relatable.' },
  { id: 'reversibility', prompt: 'Explain that eKYC is irrevocable — once the data is shared, it cannot be taken back. Not by the user, not by the bank, not by anyone. Emphasize this clearly but without panic.' },
  { id: 'biometric', prompt: 'Explain the biometric part — fingerprint or iris scan will be required. This is unique body data that cannot be changed if compromised. Explain what biometric means in simple terms.' },
  { id: 'consequence', prompt: 'Explain what happens if the user proceeds: their full Aadhaar identity is permanently shared with the service provider. Cover both the immediate effect and long-term implication.' },
  { id: 'who_gets_data', prompt: 'Explain who receives the data — the service provider shown on screen. Explain that the user should verify who the company is before sharing. If they don\'t recognize the company, they should not proceed.' },
  { id: 'alternative', prompt: 'Explain alternatives to eKYC: physical KYC at a bank branch, video KYC, or document upload KYC. These are slower but less data is shared at once. The user has options.' },
  { id: 'safety', prompt: 'Explain when eKYC is safe (recognized bank, government service, trusted company) and when it is dangerous (unknown company, unsolicited request, pressure to act fast). Give practical red flags.' },
  { id: 'action', prompt: 'Give the user a clear recommendation: if they trust the company and understand what they\'re sharing, they can proceed. If they have any doubt, decline and ask someone they trust. No rush.' },
];

const PERSONAS = {
  arjun: 'GenZ Mumbai college student, Hinglish, casual, digitally confident',
  rajan: 'Farmer from Vidarbha, Hindi only, grade 4 education, very low digital confidence',
  sunita: 'Migrant worker woman, colloquial Hindi, basic literacy, very low digital confidence',
};

const EKYC_SCREEN = 'Complete eKYC with Aadhaar. Your Aadhaar number and biometric data will be shared with the service provider. eKYC is irrevocable — once shared, your identity data cannot be recalled. Aadhaar-based eKYC shares: full name, address, photo, date of birth, and Aadhaar number. Digital consent required. I authorize sharing my Aadhaar details.';

async function redisSet(key, value) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`Redis SET failed: ${r.status}`);
}

async function generate(chunk, persona, personaProfile) {
  const prompt = `You are GATO, the DPIx Journey Intelligence agent. The user is on an eKYC consent screen and is having a voice conversation with you about it.

SCREEN CONTENT:
${EKYC_SCREEN}

PERSONA: ${personaProfile}

USER'S QUESTION/INTENT: ${chunk.prompt}

LANGUAGE: Hindi — write ONLY in Devanagari script. No Roman/English letters at all. Every single word must be in Devanagari.

Rules:
- This is a CONVERSATIONAL response, not a monologue. Keep it to 2-4 sentences.
- Speak naturally as if talking to the person face to face.
- Match vocabulary to the persona — simple words for low literacy, casual for GenZ.
- Be direct and practical. No filler.
- Output ONLY the spoken words. No labels, no JSON.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.[0]?.text?.trim() || '';
}

async function main() {
  const jobs = [];
  for (const chunk of CHUNKS) {
    for (const [pid, profile] of Object.entries(PERSONAS)) {
      jobs.push({ chunk, persona: pid, profile });
    }
  }

  console.log(`\n📦 Generating ${jobs.length} eKYC conversation chunks...\n`);
  let ok = 0, fail = 0;

  for (let i = 0; i < jobs.length; i++) {
    const { chunk, persona, profile } = jobs[i];
    const key = `klh:ekyc:chunk:${chunk.id}:${persona}:hi`;
    const label = `[${i + 1}/${jobs.length}] ${key}`;
    try {
      process.stdout.write(`${label} ... `);
      const script = await generate(chunk, persona, profile);
      if (!script) throw new Error('Empty');
      await redisSet(key, JSON.stringify({ script, chunk: chunk.id, persona, language: 'hi', generated_at: new Date().toISOString() }));
      console.log(`✓ (${script.length} chars)`);
      ok++;
      if (i < jobs.length - 1) await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.log(`✗ ${e.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Done. ${ok} cached, ${fail} failed.\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
