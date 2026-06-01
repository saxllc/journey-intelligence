---
name: applicationator
description: Use this skill for any work related to the Applicationator project or similar two-part demo systems (desktop configurator + mobile app mockup). Covers: building single-file HTML demos with Express/Node.js backends, Vercel static + serverless deployment, Supabase real-time sync, Sarvam AI TTS integration, ngrok tunneling, PowerShell workflows on Windows 11, and Claude API proxying. Trigger when the user mentions applicationator, finternet, KLH demo, journey-intelligence, configurator, mobile mockup, demo system, or asks to build a PoC with similar stack components. Also trigger for any PowerShell file operations, Vercel deployment issues, CORS debugging, mobile audio playback problems, or ngrok tunnel issues on Windows.
---

# Applicationator Project Skill

## Who this is for

A non-technical builder on Windows 11 who designs systems and builds PoCs by instructing Claude. Does not write code from scratch. Works by copy-pasting complete files and running PowerShell commands. Every instruction must be executable as-is — no implied steps, no "you know what to do" shortcuts.

---

## CRITICAL RULES — READ BEFORE EVERY EDIT

### 1. Never edit without reading the current file first

Before touching any file the user uploaded or referenced, read it in full using `view`. Do not assume contents from memory or prior turns. Files drift between sessions. Skipping this step is the #1 source of regressions in this project.

### 2. Always produce complete files, not diffs

The user cannot reliably apply partial patches. Every code change must output the entire file, ready to save and deploy. No "find this line and replace" instructions unless the change is truly a single line AND you provide the exact search string.

### 3. New versions get new filenames

When iterating on UI files: `finternet.html` → `finternet2.html` → `finternet3.html`. Never overwrite. The user compares versions side by side.

### 4. Track all changes in a changelog table

After producing a file, list what changed in a table:

| # | Change | Status |
|---|--------|--------|
| 1 | Fixed FAB centering | ✅ |
| 2 | Added play/pause toggle | ✅ |

This is the regression safety net.

### 5. No build steps

All demo HTML files must be self-contained single files. No webpack, no npm build, no bundlers. CSS and JS inline. External CDN imports are OK (e.g., Supabase JS client, Inter font).

---

## Environment

| Component | Detail |
|-----------|--------|
| OS | Windows 11 |
| Shell | PowerShell (right-click = paste, not Ctrl+V) |
| Editor | VS Code (`code .` from project dir) |
| Node | v24+ via fnm |
| npm | v11+ |
| Git | Connected to GitHub (`saxllc/journey-intelligence`, `saxllc/applicationator`) |
| Process manager | PM2 (global install) |
| Tunnel | ngrok (persistent free URL: `handbook-relay-headstand.ngrok-free.dev`) |

---

## Project Structure — Applicationator

```
C:\Users\dhuli\applicationator\
├── demo/
│   ├── configurator.html    ← Desktop control panel
│   ├── finternet.html       ← Mobile Finternet demo (iPhone 15 frame)
│   ├── klh-world-model.html ← Interactive world model demo
│   ├── kyapoc.html          ← KYA PoC demo
│   └── server.js            ← Express API proxy (local dev only)
├── api/                     ← Vercel serverless functions
│   ├── health.js
│   ├── tts.js
│   ├── klh-script.js
│   └── rhetorical.js
├── public/                  ← Vercel-served static files (copy HTML here for deploy)
├── src/                     ← Core modules (from journey-intelligence)
│   ├── classify.js
│   ├── rhetorical.js
│   ├── kya-likha-hai.js
│   ├── confidence-artefact.js
│   └── cas-gate.js
├── .env                     ← Local API keys (never commit)
├── start-demo.ps1           ← One-command local startup
├── vercel.json
└── package.json
```

### Two deployment modes

| Mode | When | What runs |
|------|------|-----------|
| **Local dev** | Testing with `start-demo.ps1` | Express on :3000 + ngrok tunnel + PM2 |
| **Vercel production** | Always-on demo, no laptop needed | `api/*.js` serverless functions + `public/*.html` static |

### Deploy commands

**Vercel (production):**
```powershell
cd C:\Users\dhuli\applicationator
git add .
git commit -m "description of change"
git push
```
Vercel auto-deploys on push. No manual `vercel --prod` needed if git-connected.

**Local dev:**
```powershell
cd C:\Users\dhuli\applicationator
.\start-demo.ps1
```

---

## Known Bugs and Fixes — Permanent Reference

These issues have all been hit and resolved. They WILL recur if the patterns below are not followed in every new file.

### 1. PowerShell BOM encoding breaks Node.js

**Symptom:** Vercel deploy returns 500 or parse errors on JS files created via PowerShell.

**Cause:** PowerShell's `Out-File` and `Set-Content` add a UTF-8 BOM (byte order mark) that Node.js chokes on.

**Fix:** Always create files with:
```powershell
[System.IO.File]::WriteAllText("C:\full\path\to\file.js", $content)
```

**Bulk fix for existing files:**
```powershell
Get-ChildItem api\*.js | ForEach-Object {
  [System.IO.File]::WriteAllText($_.FullName, ([System.IO.File]::ReadAllText($_.FullName)).TrimStart([char]0xFEFF))
}
```

### 2. CORS blocks cross-origin requests

**Symptom:** Phone browser shows `NetworkError` when calling Express through ngrok or Vercel serverless.

**Fix — Express middleware (must be BEFORE routes):**
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
```

**Fix — Vercel serverless (in every function):**
```javascript
if (req.method === 'OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.status(200).end();
}
res.setHeader('Access-Control-Allow-Origin', '*');
```

### 3. ngrok free tier browser warning blocks fetch

**Symptom:** First fetch to ngrok URL returns HTML warning page instead of JSON.

**Fix:** Add header to every fetch call that goes through ngrok:
```javascript
headers: {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}
```

### 4. Mobile audio autoplay blocked

**Symptom:** TTS audio fetches successfully but `new Audio(dataUri).play()` silently fails on iPhone/Android.

**Cause:** Browser autoplay policy. After an `await fetch()`, the user gesture context is lost. `new Audio()` cannot play.

**Fix:** Use Web Audio API instead. This pattern works:
```javascript
let _actx = null;
function getActx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

async function playBase64(dataUri) {
  const ctx = getActx();
  await ctx.resume();  // CRITICAL — must call before first await
  const b64 = dataUri.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buf = await ctx.decodeAudioData(bytes.buffer);
  return new Promise((res) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = res;
    src.start(0);
  });
}
```

**Additional TTS patterns that must be applied together:**
- Single locked speaker per session (don't randomize per chunk)
- Lookahead buffer: prefetch chunk N+1 while chunk N plays
- `closeSheet()` must call `stopAudio()`
- Play/pause toggle, not one-way play
- Language switch must stop current audio and regenerate KLH script

### 5. Hindi returns romanized instead of Devanagari

**Symptom:** KLH script for Hindi comes back as "aapki zameen" instead of "आपकी ज़मीन".

**Cause:** Claude LLM defaults to transliteration when prompt says only "respond in Hindi."

**Fix:** Explicit per-language script instructions in the prompt:
```javascript
const LANG_INSTRUCTION = {
  hi: 'Hindi — write ONLY in Devanagari script (हिंदी). No Roman/English transliteration. Wrong: "aapki zameen". Correct: "आपकी ज़मीन".',
  en: 'English — plain English only.',
  kn: 'Kannada — write ONLY in Kannada script (ಕನ್ನಡ). No transliteration.',
  ta: 'Tamil — write ONLY in Tamil script (தமிழ்). No transliteration.'
};
```

### 6. Duplicate Express routes cause silent failures

**Symptom:** Endpoint returns wrong data or 500. Server log shows no error.

**Cause:** Two `app.post('/api/same-path')` blocks in server.js. Express matches the first one and stops. If the first is broken, the working second one never runs.

**Fix:** Before adding any endpoint, search the file: `grep -n "api/endpoint-name" server.js`. If a duplicate exists, delete it. When producing a clean server.js, always write the full file from scratch rather than appending.

### 7. dotenvx intercepts environment variables

**Symptom:** `process.env.ANTHROPIC_API_KEY` is undefined despite being in `.env`.

**Cause:** `dotenvx` (installed globally) intercepts before `dotenv.config()` runs.

**Fix:** Use explicit path in dotenv config:
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
```
And wrap in try/catch for Vercel compatibility (Vercel has no `.env` file — it uses dashboard env vars):
```javascript
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch(e) {}
```

### 8. Server restart doesn't pick up code changes

**Symptom:** You edited server.js but the old behavior persists.

**Cause:** Node caches `require()` modules. The old process is still running on port 3000.

**Fix:** Always kill all node processes first:
```powershell
taskkill /F /IM node.exe 2>$null
cd C:\Users\dhuli\applicationator
node demo/server.js
```
Do this in a NEW PowerShell window. Claude Code's bash tool cannot reliably restart servers.

### 9. Sarvam TTS speaker validation

**Valid speakers for Bulbul v2:** `anushka`, `abhilash`, `manisha`, `vidya`, `arya`, `karun`, `hitesh`

Any other speaker name (e.g., `meera` from v1) returns an error.

### 10. Claude max_tokens too low for Indic scripts

**Symptom:** JSON response from Claude API is truncated mid-string.

**Cause:** Devanagari, Kannada, Tamil characters consume more tokens than Latin. 700 tokens is not enough.

**Fix:** Set `max_tokens: 1200` minimum for any prompt expecting Indic script output.

### 11. Supabase free tier auto-pauses

**Symptom:** DNS resolution fails for Supabase URL after inactivity.

**Test:**
```powershell
nslookup xbtmbolhfgyondgibhki.supabase.co
```
If it returns "non-existent domain," the project is paused or deleted.

**Fix:** Log into Supabase dashboard and restore the project, or create a new one and update all env vars.

### 12. FAB button icon misalignment

**Symptom:** Speaker icon inside floating action button shifts or disappears.

**Fix:** Explicit flex centering (never rely on implicit alignment):
```css
.fab {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 13. Wrong directory in PowerShell

**Symptom:** `git push` returns "fatal: not a git repository."

**Cause:** Terminal is in `C:\Users\dhuli\` instead of the project directory.

**Fix:** Always `cd` first:
```powershell
cd C:\Users\dhuli\applicationator
```

---

## Workflow: How the user works with Claude

### The copy-paste cycle

1. User describes what they want changed
2. Claude produces a complete file (not a diff)
3. Claude calls `present_files` so user can download
4. User copies file to project folder:
   ```powershell
   Copy-Item "$env:USERPROFILE\Downloads\filename.html" "C:\Users\dhuli\applicationator\demo\"
   ```
5. User deploys:
   ```powershell
   cd C:\Users\dhuli\applicationator
   git add .
   git commit -m "change description"
   git push
   ```
6. User tests on phone browser and reports back

### When user uploads a file for editing

1. **Read the full uploaded file first** — `view /mnt/user-data/uploads/filename`
2. If file is large (truncated in view), read it in sections with `view_range`
3. Make changes using Python string replacement in bash for surgical precision:
   ```bash
   python3 -c "
   with open('/path/to/file.html', 'r') as f:
       content = f.read()
   content = content.replace('OLD_EXACT_STRING', 'NEW_STRING')
   with open('/path/to/output.html', 'w') as f:
       f.write(content)
   # Verify
   print('OLD remaining:', content.count('OLD_EXACT_STRING'))
   print('NEW count:', content.count('NEW_STRING'))
   "
   ```
4. Always verify replacements with count checks
5. Produce the full output file for download

### When resuming after a gap

User may return days or weeks later. Do not assume any service is running.

**Checklist to give the user:**
```powershell
# 1. Check if Node is accessible
node --version

# 2. Check if project exists
cd C:\Users\dhuli\applicationator
dir

# 3. Start local services (if needed)
.\start-demo.ps1

# 4. OR just deploy to Vercel (no local server needed)
git add .
git commit -m "resuming"
git push
```

---

## Question Bank — Common Questions This User Asks

These are real questions from past sessions. Having them pre-indexed saves at least one round-trip per session.

### Deployment & Infrastructure

| Question | Answer |
|----------|--------|
| "Do I need to rerun start-demo.ps1?" | Only if laptop was restarted or services were killed. Check: `Invoke-RestMethod http://localhost:3000/api/health` |
| "Do I need to restart the server for this change?" | Server-side changes (server.js, api/*.js) → YES. Frontend HTML changes → NO, just `git push`. |
| "How do I make this work when my laptop sleeps?" | Move to Vercel serverless. Set env vars in Vercel dashboard. Remove ngrok dependency from HTML files. |
| "PowerShell command to open .env" | `notepad C:\Users\dhuli\applicationator\.env` |
| "How to deploy to Vercel?" | `cd C:\Users\dhuli\applicationator` then `git add .` → `git commit -m "msg"` → `git push` |
| "Where do HTML files go for Vercel?" | `public/` folder for Vercel serving. `demo/` folder for local dev. Both can coexist. |
| "Where do I get API keys?" | Anthropic: `console.anthropic.com` → API Keys. Sarvam: Sarvam AI dashboard. |

### Debugging

| Question | Answer |
|----------|--------|
| "I see NetworkError on phone" | Three possible causes in order: (1) CORS not set, (2) ngrok header missing, (3) server not running. Test with `Invoke-RestMethod` from PowerShell first. |
| "502 Bad Gateway" | ngrok is running but Express is not. Start Express: `node demo/server.js` |
| "Both ngrok and Express are red in configurator" | Run health check: `Invoke-RestMethod -Uri "http://localhost:3000/api/health"` then `Invoke-RestMethod -Uri "https://handbook-relay-headstand.ngrok-free.dev/api/health" -Headers @{"ngrok-skip-browser-warning"="true"}` |
| "Hindi text is in English letters" | The Devanagari bug. Check server.js prompt for explicit script instruction. See fix #5 above. |
| "Audio doesn't play on phone" | The autoplay bug. Must use Web Audio API, not `new Audio()`. See fix #4 above. |
| "Changes not taking effect" | Kill node: `taskkill /F /IM node.exe` then restart. Old process is cached. |
| "KLH not generating" | Check: (1) Is `generateAndSetKLH()` called on screen change? (2) Is the API endpoint returning 200? (3) Is `max_tokens` ≥ 1200? |

### File Operations

| Question | Answer |
|----------|--------|
| "How to copy downloaded file to project?" | `Copy-Item "$env:USERPROFILE\Downloads\filename" "C:\Users\dhuli\applicationator\demo\"` |
| "How to open file in editor?" | `code C:\Users\dhuli\applicationator\demo\filename.html` or navigate in VS Code |
| "How to check what's in the folder?" | `Get-ChildItem C:\Users\dhuli\applicationator\demo\` |
| "How to find text in a file?" | `Select-String -Path demo\server.js -Pattern "search-term"` |

---

## API Contracts

### /api/tts (Sarvam Bulbul v2)

```
POST /api/tts
Body: { "text": "string", "speaker": "anushka", "language": "hi-IN" }
Response: { "data_uri": "data:audio/wav;base64,..." }
```

Valid speakers: `anushka`, `abhilash`, `manisha`, `vidya`, `arya`, `karun`, `hitesh`
Valid languages: `hi-IN`, `en-IN`, `kn-IN`, `ta-IN`

### /api/klh-script (Claude Sonnet)

```
POST /api/klh-script
Body: {
  "screen_content": "text on screen",
  "persona_profile": "P1_GENZ_MUMBAI | P2_SENIOR | P3_MIGRANT | P4_FARMER_VIDARBHA",
  "language": "hi | en | kn | ta",
  "verbosity": "LOW | MEDIUM | HIGH"
}
Response: { "script": "narration text in target language and script" }
```

### /api/rhetorical (Claude Sonnet)

```
POST /api/rhetorical
Body: { "step": { ...step object }, "persona": "string", "language": "string" }
Response: { "headline": "string", "explanation": "string", "materiality": "string" }
```

### /api/health

```
GET /api/health
Response: { "status": "ok", "uptime": "35s", "time": "ISO string" }
```

---

## UI Patterns — Reuse These

### iPhone 15 frame bezel
- Dimensions: 393×852 CSS pixels
- Use `position: relative` container with `border-radius: 44px`, black border, notch at top
- All content `position: absolute` inside the frame
- Bottom sheet slides up from bottom of phone frame, not browser bottom

### Bottom sheet pattern
- Overlay darkens phone screen background
- Drag handle at top
- Close button (✕) top right
- Content scrollable with `max-height`
- Opening sheet hides the FAB; closing shows it again

### FAB (floating action button)
- Fixed position inside phone frame (not viewport)
- Always use explicit `display:flex; align-items:center; justify-content:center`
- Icon + optional label

### Language switcher
- Horizontal pill row: HI | EN | KN | TA
- Switching language must: stop audio, regenerate KLH script, update UI text

### Persona-adaptive UI
- P1 (GenZ): standard text, Hinglish mix OK
- P2 (Senior): slightly larger text, formal Hindi
- P3 (Migrant): larger text, colloquial Hindi, simpler vocabulary
- P4 (Farmer): largest text, Vidarbha dialect markers, maximum verbosity default

---

## Supabase Configuration

**Project URL:** `https://xbtmbolhfgyondgibhki.supabase.co`
**Table:** `configurations`
**Active row ID:** `active`
**Fields:** `ngrok_url`, `persona_name`, `klh_verbosity`, `updated_at`

**Real-time subscription pattern (client-side JS):**
```javascript
const channel = supabase
  .channel('config-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'configurations',
    filter: 'id=eq.active'
  }, (payload) => {
    applyConfig(payload.new);
  })
  .subscribe();
```

Note: Supabase free tier auto-pauses after inactivity. If DNS fails, restore from dashboard.

---

## Instructions for Claude When Using This Skill

1. Before writing any code, ask: "Upload the current file so I can read it first." If the user says it hasn't changed, still read from the last known version.

2. Every file output must be complete and self-contained. No partial patches.

3. Every PowerShell command must include the full path. Never assume the user is in the right directory.

4. After producing a file, provide the exact copy + deploy commands:
   ```powershell
   Copy-Item "$env:USERPROFILE\Downloads\[filename]" "C:\Users\dhuli\applicationator\demo\"
   cd C:\Users\dhuli\applicationator
   git add .
   git commit -m "[description]"
   git push
   ```

5. When the user reports an error, ask them to paste the exact error text. Do not guess. Two past sessions were wasted on guessing.

6. If the change is server-side, always include the restart command:
   ```powershell
   taskkill /F /IM node.exe 2>$null
   cd C:\Users\dhuli\applicationator
   node demo/server.js
   ```

7. If the change is frontend-only, explicitly say "No server restart needed."

8. For any Indic language output from Claude API, set `max_tokens: 1200` and include explicit script instructions in the prompt.

9. For any fetch to ngrok, include `'ngrok-skip-browser-warning': 'true'` header.

10. For any audio playback, use Web Audio API with `AudioContext.resume()` before the first await. Never use `new Audio()`.

11. When producing HTML files, include CORS-safe fetch wrappers and error display in the UI (not just console.error).

12. Never use `Out-File` or `Set-Content` in PowerShell for JS/JSON files. Always use `[System.IO.File]::WriteAllText()`.
