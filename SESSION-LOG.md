# Session Log — KLH Migration & Build

**Date:** June 2026
**Repo:** [saxllc/journey-intelligence](https://github.com/saxllc/journey-intelligence)

---

## What was done

### Task A — Retire ngrok/laptop dependency

Migrated from ngrok tunnel (requires laptop running Express) to Vercel serverless. All `api/*.js` files converted to ESM `export default` handlers. All demo HTML files updated from `http://localhost:PORT` / ngrok URLs to relative `/api/*` paths. `configurator.html` now checks `/api/health` instead of ngrok status.

### Task B — Tier 1 precomputed narration cache

Built Upstash Redis cache layer in front of Claude API calls.

- Created `scripts/generate-cache.js` — generates 50 narration entries offline (5 L4 journeys × 3 personas × 3 verbosity levels × Hindi + 5 English)
- Created `scripts/generate-ekyc-chunks.js` — generates 27 eKYC conversation chunks (9 intents × 3 personas × Hindi)
- Modified `api/klh-script.js` to check cache first, fall through to live Claude on miss
- Cache key: `klh:{journeyId}:{personaSlug}:{verbosity}:{langCode}`
- Added `resolveJourney()` (fingerprint matching), `resolvePersona()` (keyword mapping), `resolveLang()` (code normalization)
- Fixed double-encoded JSON bug: generation script double-stringified, added defensive double-parse in `cacheGet()`

### Task C — Side-by-side tier comparison

Created `demo/tier-compare.html`. Fires the same journey request twice: one normal (hits cache), one with `nocache: true` (forces live Claude). Shows latency, cost, source, and audio playback for each side.

### Task D — Materiality router with CAS gate

Created `demo/materiality-router.html`. All 13 journeys organized by materiality level (L1-L4). Route visualization with step indicators. Interactive CAS gate modal for L4 journeys: 9-node cascade display, 5-second countdown before proceed is enabled.

### Duplex PoC — Voice conversation on eKYC

Created `demo/ekyc-duplex.html` and `api/ekyc-chunk.js`. Voice-in (Sarvam STT) → intent matching → cache chunk lookup → voice-out (Sarvam TTS). 9 chip shortcuts for common questions. iPhone 15 Pro mock with Dynamic Island, dark/light toggle.

### Cover page

Created `demo/index-klh.html`. Steve Jobs-style explainer with 5 scroll-snap sections, nav dots, poster+modal pattern for embedded demo, deep links to all other demo pages. Background #1A1A1F, body text 15-17px.

### Google Analytics

Added GA tag G-QKKSDLY59C to all 11 HTML files in `demo/`.

---

## Key bugs fixed during session

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Cache returning `source: 'live'` | Vercel env vars added after last deploy; not picked up until redeploy | Empty commit + push to trigger redeploy |
| Double-encoded JSON from Redis | `generate-cache.js` stringified twice | Defensive double-parse in `cacheGet()` |
| iOS audio not playing | Web Audio API loses user gesture after async chain | Replaced with persistent `<audio>` element, unlocked on first touch via silent WAV data URI |
| Phone mock invisible on mobile | CSS `display:none` at 768px breakpoint | Restructured layout: phone on top, chat below |
| Embedded iframe not scrollable/clickable | `transform: scale()` breaks pointer events | Poster+modal pattern: static preview inline, full-size interactive modal on tap |
| Git push rejected | Remote had newer commits | `git pull --rebase` |
| Files edited but git shows no changes | Edits in Cowork folder, git repo is separate folder | Copy files from Cowork → git repo before commit |

---

## Architecture decisions

1. **Multimodel, not single-model.** Claude handles English DPL reasoning. Sarvam handles Indic localization + TTS/STT. Serial pipeline today; duplex at 200ms is the target.
2. **Cache-first.** T1 is free and fast. T2 is the fallback. This means the demo works without burning API credits for known journeys.
3. **`nocache` flag.** Allows forcing T2 for A/B comparison without a separate endpoint.
4. **LANG_INSTRUCTION map.** Explicit script enforcement ("write ONLY in Devanagari") prevents Hindi romanization, which was a recurring Claude failure mode.
5. **Poster+modal for embedded demos.** Scaled iframes break touch. Non-interactive preview + full-size modal on tap is the reliable pattern.
6. **Persistent `<audio>` element for iOS.** Web Audio API's `AudioContext` doesn't survive async fetch chains on iOS Safari. A single `<audio>` element, unlocked once on first user gesture, then src-swapped for each playback, works reliably.

---

## Two-folder workflow

Cowork edits go to: `C:\Users\dhuli\Documents\Claude\Projects\applicationator\`
Git repo lives at: `C:\Users\dhuli\applicationator\`

Deploy sequence:
```powershell
Copy-Item "C:\Users\dhuli\Documents\Claude\Projects\applicationator\demo\*.html" "C:\Users\dhuli\applicationator\demo\" -Force
Copy-Item "C:\Users\dhuli\Documents\Claude\Projects\applicationator\api\*.js" "C:\Users\dhuli\applicationator\api\" -Force
cd C:\Users\dhuli\applicationator
git add .
git commit -m "message"
git push
```
