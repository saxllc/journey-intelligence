/**
 * Tier 1 cache CLEAR — surgically deletes ONLY the klh:* narration keys.
 *
 * Use this instead of FLUSHDB / FLUSHALL. FLUSHDB wipes the ENTIRE database
 * (every key, irreversibly) — that is what caused the data loss. This deletes
 * only the cache keys this app owns, leaving anything else in the DB untouched.
 *
 * Usage: node scripts/clear-cache.js          (asks for confirmation)
 *        node scripts/clear-cache.js --yes     (no prompt)
 * Requires .env with UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const MATCH = 'klh:*';

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('Missing env vars. Need: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  process.exit(1);
}

async function scanAll() {
  let cursor = '0';
  const keys = [];
  do {
    const r = await fetch(`${UPSTASH_URL}/scan/${cursor}?match=${encodeURIComponent(MATCH)}&count=200`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!r.ok) throw new Error(`SCAN ${r.status}: ${await r.text()}`);
    const d = await r.json();
    cursor = d.result[0];
    keys.push(...d.result[1]);
  } while (cursor !== '0');
  return keys;
}

async function del(key) {
  const r = await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return r.ok;
}

function confirm(q) {
  if (process.argv.includes('--yes')) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(q, a => { rl.close(); res(/^y(es)?$/i.test(a.trim())); }));
}

async function main() {
  const keys = await scanAll();
  console.log(`\nFound ${keys.length} keys matching "${MATCH}".`);
  if (keys.length === 0) return;
  const go = await confirm(`Delete these ${keys.length} cache keys? (other keys in the DB are NOT touched) [y/N] `);
  if (!go) { console.log('Aborted. Nothing deleted.'); return; }
  let ok = 0;
  for (const k of keys) { if (await del(k)) ok++; }
  console.log(`\n🗑️  Deleted ${ok}/${keys.length} klh:* keys.`);
  console.log(`   Recover instantly: node scripts/restore-cache.js\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
