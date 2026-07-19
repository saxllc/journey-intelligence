/**
 * Tier 1 cache RESTORE — re-uploads narrations from the local backup snapshot
 * (scripts/cache-backup.json) into Upstash Redis. ZERO Claude calls, instant.
 *
 * Use this any time the cache is empty/flushed. As long as cache-backup.json
 * exists (created by seed-cache.js), you never pay to regenerate again.
 *
 * Usage: node scripts/restore-cache.js
 * Requires .env with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BACKUP_PATH = path.join(__dirname, 'cache-backup.json');

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Missing env vars. Need: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}
if (!fs.existsSync(BACKUP_PATH)) {
  console.error(`No backup found at ${BACKUP_PATH}`);
  console.error('Run  node scripts/seed-cache.js  once to create it.');
  process.exit(1);
}

async function redisSet(key, entry) {
  const r = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!r.ok) throw new Error(`Redis SET ${r.status}: ${await r.text()}`);
}
async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
  if (!r.ok) return null;
  const d = await r.json();
  return d.result ? true : null;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  const entries = data.entries || [];
  console.log(`\n♻️  Restoring ${entries.length} entries from backup (saved ${data.saved_at})...\n`);
  let ok = 0, bad = 0;
  for (let i = 0; i < entries.length; i++) {
    const { key, value } = entries[i];
    try {
      process.stdout.write(`[${i + 1}/${entries.length}] ${key} ... `);
      await redisSet(key, value);
      const check = await redisGet(key);
      if (!check) throw new Error('verify failed');
      console.log('✓');
      ok++;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      bad++;
    }
  }
  console.log(`\n✅ Restored ${ok}, failed ${bad}. No Claude calls used.\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
