---
name: journey-intelligence
version: 0.1.0
description: >
  Given a canonical digital flow (sequence of screens, steps, or API interactions),
  generate a rhetorical layer — personalized, multilingual, multimodal — adapted
  to the user's comprehension context. Works across any app, any domain.
author: SD / sax.llc
license: MIT
---

# Journey Intelligence Skill

## What This Skill Does

Takes a canonical UI flow as input. Produces a rhetorical adaptation layer as output.

Canonical = the deterministic, auditable path (what the system requires).
Rhetorical = the adaptive, AI-generated path (what the user needs to comprehend).

The canonical flow does not change. The rhetorical layer wraps around it.

## When To Trigger This Skill

Use this skill when:
- A user-facing flow involves consent, identity, financial transaction, or data sharing
- The flow crosses a materiality threshold (irreversible action, financial consequence, identity exposure)
- The user's inferred context suggests comprehension support is needed (language mismatch, first-time user, error state, accessibility need)
- A developer wants to add a "Kya Likha Hai" layer to any existing screen or flow

Do NOT use this skill for:
- Backend/API-only operations with no user-facing moment
- Purely decorative or branding changes
- Flows where the user has demonstrated thick agency (high CAS-Model score)

## Core Concepts

### Transaction Materiality

Every step in a flow has a materiality level. Materiality determines how much rhetorical
support the system generates.

```
Level 0 — Informational    : No consequence. Reading content, browsing.
                             Rhetorical: minimal. No checkpoint needed.

Level 1 — Navigational     : Choice with easy reversal. Selecting options, filtering.
                             Rhetorical: light guidance. Undo path visible.

Level 2 — Transactional    : Action with moderate consequence. Submitting a form, 
                             making a payment, sharing a document.
                             Rhetorical: plain-language summary of what happens next.
                             Confidence artefact shown post-action.

Level 3 — Consequential    : Irreversible or high-stakes. Identity verification,
                             asset tokenization, consent to data sharing, 
                             biometric submission, loan agreement.
                             Rhetorical: full comprehension checkpoint.
                             CAS gate required. Kya Likha Hai activated.
                             Recovery path explicitly surfaced.
```

### Cognitive Metabolism

Users process information at different rates and through different modalities.
The skill adapts output based on:

- **Language**: user's preferred language (not app default)
- **Modality**: text, audio (TTS via Sarvam Bulbul), visual (icon/illustration), or combined
- **Density**: how much information per screen. First-time = low density. Returning = higher.
- **Pacing**: time-on-screen signal. If user moves too fast through Level 3, slow down. Insert checkpoint.
- **Error state**: if user has just encountered an error, next screen gets maximum rhetorical support

### Confidence Artefacts

Post-action signals that encode what just happened, in the user's terms.

Every Level 2+ action generates a confidence artefact containing:
1. **What happened** — plain-language, user's language, grade 6 reading level max
2. **Who received** — if data was shared, name the recipient in plain terms
3. **What changed** — before/after state, if applicable
4. **What you can do** — undo path, complaint path, or "this cannot be undone" (honest)
5. **Tone signal** — audio tone classification per Kya Likha Hai pattern:
   - Informational: neutral tone (440Hz)
   - Caution: attention tone (660Hz)  
   - Critical: alert tone (880Hz)

### Kya Likha Hai Pattern

"What does it say?" — voice-first explanation of any screen element.

Activation: user taps ear icon, long-presses any element, or asks voice assistant.

Sequence:
1. Ting (880Hz, 80ms) — acknowledgment
2. Classification — AI infers: informational / caution / critical
3. Distinct tone per class
4. Plain-language explanation generated in user's language
5. TTS speaks it aloud (Sarvam Bulbul for Indian languages)
6. Text types out simultaneously on screen
7. ARIA live region updates for screen readers

### CAS Gate (Comprehension Checkpoint)

Inserted before any Level 3 action. Not a terms-and-conditions scroll.

Requirements:
- Active acknowledgment (not passive scroll)
- Minimum display time: 5 seconds
- Content in user's preferred language
- Max reading level: grade 6
- Must include: what_happened, who_receives, what_can_be_undone
- Audio explanation available (not optional for Level 3)
- If user attempts to skip: gentle friction, not hard block

## Input Contract

The skill expects a canonical flow description. Minimal format:

```yaml
flow:
  name: "Aadhaar eKYC Consent"
  domain: "identity"          # identity | finance | commerce | health | education | government
  steps:
    - id: step_1
      label: "Enter Aadhaar Number"
      materiality: 1           # 0-3
      action: "input"          # input | select | confirm | submit | authenticate | consent
      data_shared: false
      reversible: true

    - id: step_2
      label: "OTP Verification"
      materiality: 2
      action: "authenticate"
      data_shared: false
      reversible: true

    - id: step_3
      label: "Consent to share KYC data"
      materiality: 3
      action: "consent"
      data_shared: true
      data_recipient: "Requesting Entity Name"
      data_fields: ["name", "address", "photo", "date_of_birth"]
      reversible: false

  user_context:               # optional, inferred if not provided
    language: "hi"            # ISO 639-1
    first_time: true
    device_tier: "low"        # low | mid | high
    accessibility: []         # ["screen_reader", "low_vision", "motor_impaired"]
```

## Output Contract

The skill produces a rhetorical layer for each step:

```yaml
rhetorical_layer:
  - step_id: step_3
    materiality: 3
    
    summary:
      text: "यह संस्था आपका नाम, पता, फोटो और जन्मतिथि देख सकेगी। यह वापस नहीं होगा।"
      language: "hi"
      reading_level: 5
      
    audio:
      provider: "sarvam_bulbul"
      language: "hi"
      tone_class: "critical"
      pre_tone_hz: 880
      
    confidence_artefact:
      what_happened: "आपने अपनी पहचान जानकारी साझा करने की अनुमति दी"
      who_received: "[Entity Name]"
      what_changed: "यह संस्था अब आपका नाम, पता, फोटो, जन्मतिथि देख सकती है"
      what_you_can_do: "यह वापस नहीं किया जा सकता। शिकायत के लिए 1947 पर कॉल करें।"
      
    cas_gate:
      required: true
      min_display_seconds: 5
      active_acknowledgment: true
      audio_explanation: true
```

## Integration Patterns

### Pattern A: Overlay on existing app
The skill generates a rhetorical layer as a JSON/YAML payload. The app renders it
as an overlay, bottom sheet, or modal on top of its existing canonical UI.
The canonical flow is untouched. The rhetorical layer is additive.

### Pattern B: API middleware
The skill sits between the app frontend and its backend. It intercepts screen
transitions, classifies materiality, and injects rhetorical content into the
response payload before the frontend renders.

### Pattern C: Claude Skill in chat
A developer pastes a flow description into Claude. The skill generates the full
rhetorical layer specification. Developer takes the output and implements it.

### Pattern D: Fork and extend
Developer forks the skill repo, modifies the materiality thresholds, adds
domain-specific classifications (e.g., health consent vs financial consent),
and deploys their own version.

## Service Dependencies

- **Sarvam AI** — speech-to-text (Saaras), text-to-speech (Bulbul), translation (Mayura)
  - API: api.sarvam.ai
  - Required for: Indian language TTS, STT, translation
  - Fallback: browser Web Speech API (degraded quality)

- **Claude API** — rhetorical content generation
  - Model: claude-sonnet-4-20250514 (speed) or claude-opus-4-6 (quality)
  - Required for: plain-language summary generation, classification, CAS gate content

- **IGDS Tokens** (when available) — canonical design tokens for government services
  - Touch targets, typography, color classification, motion
  - Source: @gov-in/design-system (future npm package)

## File Structure (Reference Implementation)

```
journey-intelligence/
  SKILL.md                    # this file
  README.md                   # setup + usage
  src/
    classify.js               # materiality classification engine
    rhetorical.js             # rhetorical layer generator (calls Claude API)
    kya-likha-hai.js          # audio explanation engine (calls Sarvam API)
    confidence-artefact.js    # post-action artefact generator
    cas-gate.js               # comprehension checkpoint component
  demo/
    index.html                # single-page demo app
    flows/
      aadhaar-ekyc.yaml       # sample canonical flow
      upi-payment.yaml        # sample canonical flow
      digilocker-fetch.yaml   # sample canonical flow
  tokens/
    materiality.json          # materiality classification tokens
    tones.json                # audio tone definitions
    reading-levels.json       # language-specific reading level configs
```

## Domain Extensions (Future Drops)

Each domain extension adds domain-specific materiality rules and rhetorical patterns:

- `journey-intelligence-identity` — Aadhaar, eKYC, face auth, biometric consent
- `journey-intelligence-finance` — UPI, tokenization, lending consent, asset transfer
- `journey-intelligence-commerce` — ONDC/Beckn transaction flows
- `journey-intelligence-health` — Ayushman Bharat, prescription consent, data sharing
- `journey-intelligence-education` — DigiLocker credential fetch, scholarship application

## Versioning

Skill file is versioned. Each GitHub release = a new skill version.
Breaking changes to input/output contract = major version bump.
New domain extensions = minor version bump.
Rhetorical improvements = patch.

---

*Built by SD / sax.llc — billion users, million journeys.*
