# KLH — Kya Likha Hai

**Comprehension layer for India's DPI stack.**
Explains financial screens to real users in their language, at their literacy level, before they act.

**Repo:** [github.com/saxllc/journey-intelligence](https://github.com/saxllc/journey-intelligence)
**Live:** [applicationator.vercel.app](https://applicationator.vercel.app)

---

## What it does

A user sees a UPI AutoPay mandate or an eKYC consent screen. KLH intercepts that moment and generates a spoken-language explanation — in Hindi, English, Kannada, or Tamil — tailored to the user's persona (GenZ urban, rural farmer, migrant worker) and verbosity preference.

The system uses a four-tier cascade:

| Tier | Source | Cost | Latency | Status |
|------|--------|------|---------|--------|
| T0 | Rules engine | $0 | <5ms | Planned |
| T1 | Precomputed cache (Upstash Redis) | $0 | <50ms | **Live** |
| T2 | Live multimodel: Claude → Sarvam | ~$0.01 | 2-5s | **Live** |
| T3 | On-device model | $0 | <200ms | Planned |

**Multimodel pipeline (T2):** Claude (English DPL reasoning) → Sarvam Bulbul v2 (Indic localization + TTS). Serial today. Duplex at 200ms is the target.

---

## Project structure

```
journey-intelligence/
├── api/                        # Vercel serverless functions (ESM)
│   ├── klh-script.js           # Core: T1 cache lookup → T2 Claude fallback
│   ├── tts.js                  # Sarvam Bulbul v2 TTS proxy
│   ├── stt.js                  # Sarvam Saaras v3 STT proxy
│   ├── ekyc-chunk.js           # Intent-matched cache chunks for duplex conversation
│   ├── health.js               # Health check endpoint
│   ├── debug.js                # Env var diagnostic
│   ├── cas-gate.js             # CAS gate API
│   ├── classify.js             # Journey classifier
│   ├── confidence-artefact.js  # Confidence artifact generator
│   ├── kya-likha-hai.js        # Legacy KLH endpoint
│   └── rhetorical.js           # Rhetorical analysis
│
├── demo/                       # Frontend (Vercel static output)
│   ├── index-klh.html          # Cover page — system explainer (entry point)
│   ├── klh-world-model.html    # Main dashboard with iPhone mock
│   ├── tier-compare.html       # Side-by-side cache vs live comparison
│   ├── materiality-router.html # 13 journeys × 4 materiality levels + CAS gate
│   ├── ekyc-duplex.html        # Voice-in/voice-out duplex conversation
│   ├── configurator.html       # Desktop configurator
│   ├── finternet-new.html      # Finternet demo (current)
│   ├── finternet.html          # Finternet demo (prior version)
│   ├── finternet_old.html      # Finternet demo (archived)
│   ├── index.html              # Original landing page
│   ├── kyapoc.html             # KYA PoC page
│   ├── mobile.html             # Mobile view
│   └── flows/
│       └── aadhaar-ekyc.yaml   # eKYC flow definition
│
├── scripts/
│   ├── generate-cache.js       # Offline: generates 50 T1 cache entries → Upstash
│   └── generate-ekyc-chunks.js # Offline: generates 27 eKYC chunk entries → Upstash
│
├── public/                     # Static assets (address-update demos, mobile variants)
├── src/                        # Legacy Express source (pre-Vercel migration)
├── vercel.json                 # Vercel routing config
├── package.json                # Dependencies: @anthropic-ai/sdk, dotenv, express
└── .gitignore                  # .vercel, .env
```

---

## Key concepts

**DPL (Digital Procedural Lexicon)** — Specialized terms users must interpret correctly: eKYC, NACH, AutoPay, UPI mandate, beneficiary, token lock. English is the native language of DPL, so Claude processes in English first.

**CAS (Comprehension-to-Action Score)** — 9-node gate cascade that must be satisfied before irreversible actions. Used at materiality level L4.

**Transaction Materiality** — L1 (Informational, e.g. balance check) through L4 (Consequential/Irreversible, e.g. eKYC consent, NACH mandate).

**Personas** — `arjun` (GenZ, Mumbai, Hinglish), `rajan` (farmer, Vidarbha), `sunita` (migrant worker).

---

## Environment variables

Set in Vercel dashboard (Settings → Environment Variables):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API (T2 live generation) |
| `SARVAM_API_KEY` | Sarvam Bulbul TTS + Saaras STT |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis (T1 cache) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth |

For local dev, copy these to `.env` at project root (gitignored).

---

## Deployment

Vercel auto-deploys on `git push` to the connected branch. No manual restart needed.

```powershell
cd C:\Users\dhuli\applicationator
git add .
git commit -m "your message"
git push
```

**Note:** The local working folder is named `applicationator` but the repo is `journey-intelligence`. The Cowork project folder at `C:\Users\dhuli\Documents\Claude\Projects\applicationator` is a separate copy. Files edited there must be copied to the git repo before pushing:

```powershell
Copy-Item "C:\Users\dhuli\Documents\Claude\Projects\applicationator\demo\*.html" "C:\Users\dhuli\applicationator\demo\" -Force
Copy-Item "C:\Users\dhuli\Documents\Claude\Projects\applicationator\api\*.js" "C:\Users\dhuli\applicationator\api\" -Force
```

---

## Cache generation

T1 cache entries are precomputed offline and stored in Upstash Redis.

```bash
# Generate narration cache (50 entries: 5 journeys × 3 personas × 3 verbosity × 2 languages)
cd C:\Users\dhuli\applicationator
node scripts/generate-cache.js

# Generate eKYC conversation chunks (27 entries: 9 intents × 3 personas × Hindi)
node scripts/generate-ekyc-chunks.js
```

Cache key format: `klh:{journeyId}:{personaSlug}:{verbosity}:{langCode}`
eKYC chunk key format: `klh:ekyc:chunk:{intentId}:{personaSlug}:hi`

---

## API endpoints

All endpoints are at `https://applicationator.vercel.app/api/`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/klh-script` | POST | Main narration: T1 cache → T2 Claude fallback |
| `/api/tts` | POST | Text-to-speech via Sarvam Bulbul v2 |
| `/api/stt` | POST | Speech-to-text via Sarvam Saaras v3 |
| `/api/ekyc-chunk` | POST | Intent-matched eKYC conversation chunks |
| `/api/health` | GET | Health check |
| `/api/debug` | GET | Env var status |

---

## Demo pages

| Page | URL | What it shows |
|------|-----|---------------|
| Cover/explainer | `/index-klh.html` | System overview, scroll-snap sections |
| Dashboard | `/klh-world-model.html` | Main KLH interface with iPhone mock |
| Tier compare | `/tier-compare.html` | Cache vs live side-by-side with latency |
| Materiality router | `/materiality-router.html` | 13 journeys, L1-L4, CAS gate for L4 |
| Duplex conversation | `/ekyc-duplex.html` | Voice-in/voice-out on eKYC consent |
| Configurator | `/configurator.html` | Desktop configuration interface |

All pages include Google Analytics tracking (G-QKKSDLY59C).
