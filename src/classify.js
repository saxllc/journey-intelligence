// src/classify.js
// Materiality Classification Engine
// Input: action object
// Output: { level (1-4), label, requiresCAS, requiresConfidenceArtefact, requiresKyaLikhaHai }

const LEVELS = {
  INFORMATIONAL: 1,
  NAVIGATIONAL: 2,
  TRANSACTIONAL: 3,
  CONSEQUENTIAL: 4
};

const RULES = [
  {
    level: 'CONSEQUENTIAL',
    match: (a) =>
      a.irreversible === true ||
      a.tags?.some((t) =>
        ['biometric', 'legal', 'aadhaar-lock', 'bank', 'consent-permanent', 'ekyc', 'esign'].includes(t)
      )
  },
  {
    level: 'TRANSACTIONAL',
    match: (a) =>
      ['submit', 'otp-verify', 'form-complete', 'payment', 'confirm'].includes(a.type) ||
      a.tags?.some((t) => ['otp', 'submit', 'verify', 'update', 'send', 'upload'].includes(t))
  },
  {
    level: 'NAVIGATIONAL',
    match: (a) =>
      ['navigate', 'select', 'menu', 'tab', 'back', 'next'].includes(a.type)
  },
  {
    level: 'INFORMATIONAL',
    match: () => true
  }
];

function classify(action) {
  if (!action || typeof action !== 'object') {
    throw new Error('classify() requires an action object');
  }

  for (const rule of RULES) {
    if (rule.match(action)) {
      const level = LEVELS[rule.level];
      return {
        level,
        label: rule.level,
        requiresCAS: level >= LEVELS.TRANSACTIONAL,
        requiresConfidenceArtefact: level >= LEVELS.TRANSACTIONAL,
        requiresKyaLikhaHai: level >= LEVELS.CONSEQUENTIAL
      };
    }
  }
}

module.exports = { classify, LEVELS };
