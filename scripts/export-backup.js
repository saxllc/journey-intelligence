/**
 * Export existing Redis cache to local backup file.
 * ZERO Claude calls — just reads Redis and saves to cache-backup.json.
 * Run this after any generate/seed to snapshot what's in Redis.
 *
 * Usage: node scripts/export-backup.js
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

async function scanAll(pattern) {
  let cursor = '0';
  const keys = [];
  do {
    const r = await fetch(`${UPSTASH_URL}/scan/${cursor}?match=${encodeURIComponent(pattern)}&count=200`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!r.ok) throw new Error(`SCAN ${r.status}: ${await r.text()}`);
    const d = await r.json();
    cursor = d.result[0];
    keys.push(...d.result[1]);
  } while (cursor !== '0');
  return keys;
}

async function redisGet(key) {
  const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.result) return null;
  let p = JSON.parse(d.result);
  if (typeof p === 'string') p = JSON.parse(p);
  return p;
}

async function main() {
  console.log('\n📥 Scanning Redis for klh:* keys...\n');
  const keys = await scanAll('klh:*');
  console.log(`Found ${keys.length} keys.\n`);

  if (keys.length === 0) {
    console.log('Nothing to export. Cache is empty.');
    return;
  }

  const entries = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    process.stdout.write(`[${i + 1}/${keys.length}] ${key} ... `);
    try {
      const value = await redisGet(key);
      if (value) {
        entries.push({ key, value });
        console.log('✓');
      } else {
        console.log('✗ (null)');
      }
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }

  fs.writeFileSync(BACKUP_PATH, JSON.stringify({
    saved_at: new Date().toISOString(),
    count: entries.length,
    entries,
  }, null, 2));

  console.log(`\n✅ Exported ${entries.length} entries to ${BACKUP_PATH}`);
  console.log(`   Restore anytime: node scripts/restore-cache.js\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
