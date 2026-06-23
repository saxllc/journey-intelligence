/**
 * Build a fast follow-on match index for the Umang cache.
 *
 * For each (journey, persona) it reads the 6 cached narratives (2 dims × 3 verbosity),
 * enriches each with dimension "anchor phrases", computes a TF-IDF vector + norm, and
 * stores one blob:  umang:idx:{journey}:{persona}
 *   { journey, persona, defaultIdf, idf:{token:w}, docs:[{key,dim,verbosity,text,vec,norm}] }
 *
 * api/umang-chunk.js loads that single blob (one Redis GET) and scores the follow-on
 * query against it in-memory → sub-second matching, no per-key fan-out.
 *
 * Run AFTER seed-umang-chunks.js. No Claude calls. Re-runnable any time.
 *
 * Usage:  node scripts/build-umang-index.js
 * Requires .env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BACKUP_PATH = path.join(__dirname, 'umang-index-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in .env');
  process.exit(1);
}

const JOURNEYS = ['ekyc','nach_mandate','credit_line','collect_unknown','token_lock','p2p_large_unknown','beneficiary_add','aadhaar_sign','autopay','p2p_small','p2m_qr','ondc','balance'];
const DIMS = ['kya_likha_hai', 'faida'];
const PERSONAS = ['arjun', 'rajan', 'sunita'];
const VERBOSITY = ['LOW', 'MEDIUM', 'HIGH'];

// Anchor phrases per CAS dimension — boost matching of common follow-ups to the right narrative.
const ANCHORS = {
  kya_likha_hai: 'क्या लिखा है मतलब समझाओ यह क्या है जानकारी डेटा साझा वापस रद्द irreversible अपरिवर्तनीय शर्तें details meaning explain',
  faida: 'फ़ायदा लाभ क्या करूँ करना चाहिए नुकसान जोखिम सुरक्षित सही है आगे बढ़ूँ benefit risk should action worth',
};

const STOP = new Set(('the a an is are was of to in on for and or that this it me my you your i we what how do does '
  + 'ye yeh kya hai ka ki ke ko se me mein hi bhi to na nahi ha haan aur ya jo wo woh is us ek hona kar karu karna '
  + 'है हैं का की के को से में ये यह क्या कैसे और या जो वो वह इस उस एक मैं मेरा आप कर करना है').split(/\s+/));
function tokenize(s) {
  return (s || '').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(t => t && !STOP.has(t) && t.length > 1);
}

async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.result) return null;
  let p = JSON.parse(d.result); if (typeof p === 'string') p = JSON.parse(p);
  return p;
}
async function redisSet(key, entryObj) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(entryObj)),
  });
  if (!r.ok) throw new Error(`Redis SET ${r.status}: ${await r.text()}`);
}

function buildIndex(rawDocs) {
  // rawDocs: [{key,dim,verbosity,text}]
  const docTokens = rawDocs.map(d => tokenize(d.text + ' ' + (ANCHORS[d.dim] || '')));
  const N = rawDocs.length;
  const df = {};
  docTokens.forEach(toks => new Set(toks).forEach(t => df[t] = (df[t] || 0) + 1));
  const idf = {};
  Object.keys(df).forEach(t => idf[t] = Math.log((N + 1) / (1 + df[t])) + 1);
  const defaultIdf = Math.log(N + 1) + 1;
  const docs = rawDocs.map((d, i) => {
    const tf = {}; docTokens[i].forEach(t => tf[t] = (tf[t] || 0) + 1);
    const vec = {}; let sum = 0;
    for (const t in tf) { const w = tf[t] * idf[t]; vec[t] = w; sum += w * w; }
    return { key: d.key, dim: d.dim, verbosity: d.verbosity, text: d.text, vec, norm: Math.sqrt(sum) || 1e-9 };
  });
  return { defaultIdf, idf, docs };
}

async function main() {
  console.log(`\n🔧 Building Umang match index for ${JOURNEYS.length} journeys × ${PERSONAS.length} personas...\n`);
  let ok = 0, empty = 0, fail = 0;
  const backup = [];
  for (const journey of JOURNEYS) {
    for (const persona of PERSONAS) {
      const rawDocs = [];
      for (const dim of DIMS) for (const v of VERBOSITY) {
        const key = `umang:${journey}:${dim}:${persona}:${v}:hi`;
        const hit = await redisGet(key);
        if (hit && hit.script) rawDocs.push({ key, dim, verbosity: v, text: hit.script });
      }
      const idxKey = `umang:idx:${journey}:${persona}`;
      if (!rawDocs.length) { console.log(`${idxKey} ... ◦ no source narratives`); empty++; continue; }
      try {
        const index = { journey, persona, built_at: new Date().toISOString(), ...buildIndex(rawDocs) };
        await redisSet(idxKey, index);
        backup.push({ key: idxKey, value: index });
        console.log(`${idxKey} ... ✓ (${rawDocs.length} docs, ${Object.keys(index.idf).length} terms)`);
        ok++;
      } catch (e) { console.log(`${idxKey} ... ✗ ${e.message}`); fail++; }
    }
  }
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ saved_at: new Date().toISOString(), count: backup.length, entries: backup }, null, 2));
  console.log(`\n✅ Index built. ${ok} written, ${empty} empty, ${fail} failed.`);
  console.log(`💾 Backup: ${BACKUP_PATH}\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
