# journey-intelligence — Project Roadmap

## Convention
- `[ ]` = Todo
- `[-]` = In Progress 🏗️ YYYY-MM-DD
- `[x]` = Done ✅ YYYY-MM-DD

---

## Day 1 — Server boots [x] ✅ 2026-04-08
- [x] Copy all src/ and demo/ files into project folder
- [x] Run `npm install` — confirm no errors
- [x] Add API keys to `.env`
- [x] Run `node demo/server.js` — confirm server starts on port 3000
- [x] Open `http://localhost:3000` — confirm all 4 steps visible, no console errors

**Done when:** Browser loads demo, sidebar shows 4 eKYC steps.

---

## Day 2 — Pure logic modules verified
- [ ] Create `test-local.js` in project root
- [ ] Test `classify.js` — run all 4 materiality levels, confirm correct output
- [ ] Test `cas-gate.js` — confirm gated:true for TRANSACTIONAL and CONSEQUENTIAL
- [ ] Test `confidence-artefact.js` — confirm artefact shape for eKYC transaction
- [ ] Fix any bugs in the three pure-logic modules

**Done when:** `node test-local.js` runs with no errors, all assertions pass.

---

## Day 3 — API integrations working
- [ ] Test `rhetorical.js` with real Anthropic key — confirm JSON output for each step
- [ ] Test `kya-likha-hai.js` with real Sarvam key — confirm audio plays in browser
- [ ] Tune rhetorical prompt if output is weak or verbose
- [ ] Test language switcher — EN, HI, KN, TA — confirm re-generation works
- [ ] Verify CAS gate blocks navigation until acknowledged

**Done when:** Full eKYC flow runs end-to-end in browser including audio.

---

## Day 4 — Pattern B and Pattern C
- [ ] Document Pattern B (API middleware) — add endpoint table to README draft
- [ ] Write `demo/pattern-c-prompt.txt` — Claude-pasteable prompt that accepts any YAML flow and returns rhetorical spec
- [ ] Test Pattern C prompt in Claude.ai using `demo/flows/aadhaar-ekyc.yaml`
- [ ] Confirm Pattern C output matches the structure of `rhetorical.js` output

**Done when:** Pattern C prompt tested and working. README endpoint table written.

---

## Day 5 — SKILL.md and README
- [ ] Audit SKILL.md — verify all 5 core concepts have working code examples
- [ ] Add Pattern A, B, C usage examples to SKILL.md
- [ ] Write `README.md` — install, run, extend (under 10 steps for a beginner)
- [ ] Add `test-local.js` to repo

**Done when:** A developer unfamiliar with the project can clone and run using only README.

---

## Day 6 — GitHub release
- [ ] Review all files — remove debug logs, clean up comments
- [ ] Git add, commit with message: `feat: v0.1 — journey intelligence skill, all patterns, aadhaar demo`
- [ ] Push to GitHub
- [ ] Tag release: `git tag v0.1 && git push origin v0.1`
- [ ] Write one-para repo description for GitHub

**Done when:** Public URL exists. `git clone` + `npm install` + `node demo/server.js` works.

---

## Backlog (post v0.1)
- [ ] Add a second demo flow (e.g. UPI payment or PAN verification)
- [ ] Add Mayura translation layer (Sarvam) for non-Hindi languages
- [ ] CAS Gate: add explicit text-entry confirmation for CONSEQUENTIAL steps
- [ ] Publish to npm as `journey-intelligence`
- [ ] Write arXiv preprint — Journey Intelligence as rhetorical layer over DPI canonical flows
