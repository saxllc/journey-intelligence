/**
 * Zero-cost restore of the Umang cache from scripts/umang-chunks-backup.json.
 * No Claude calls — just re-writes every cached entry to Upstash under the umang: namespace.
 * Encoding matches api/umang-chunk.js cacheGet (double-encoded). NEVER use FLUSHDB.
 *
 * Usage:  node scripts/restore-umang-chunks.js
 * Requires .env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BACKUP_PATH = path.join(__dirname, 'umang-chunks-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in .env');
  process.exit(1);
}
if (!fs.existsSync(BACKUP_PATH)) {
  console.error(`No backup at ${BACKUP_PATH}. Run: node scripts/seed-umang-chunks.js first.`);
  process.exit(1);
}

async function redisSet(key, entryObj) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(entryObj)),
  });
  if (!r.ok) throw new Error(`Redis SET ${r.status}: ${await r.text()}`);
}
async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.result) return null;
  let p = JSON.parse(d.result); if (typeof p === 'string') p = JSON.parse(p);
  return p;
}

async function main() {
  const snap = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const entries = snap.entries || [];
  console.log(`\n♻️  Restoring ${entries.length} Umang chunks (saved ${snap.saved_at})...\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < entries.length; i++) {
    const { key, value } = entries[i];
    const label = `[${i + 1}/${entries.length}] ${key}`;
    try {
      await redisSet(key, value);
      const check = await redisGet(key);
      if (!check || !check.script) throw new Error('verify failed');
      console.log(`${label} ... ✓`); ok++;
    } catch (e) { console.log(`${label} ... ✗ ${e.message}`); fail++; }
  }
  console.log(`\n✅ Restore done. ${ok} restored, ${fail} failed. ($0 — no Claude calls)\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
