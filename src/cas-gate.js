// src/cas-gate.js
// CAS Gate — Comprehension Checkpoint

const { classify, LEVELS } = require('./classify');

function generateCASGate(step, options = {}) {
  const materiality = classify(step);

  if (!materiality.requiresCAS) {
    return { gated: false, step_id: step.id, materiality: materiality.label };
  }

  return {
    gated: true,
    step_id: step.id,
    materiality: materiality.label,
    gate_type: selectGateType(materiality.label),
    content: buildGateContent(step, materiality.label, options),
    pass_condition: buildPassCondition(materiality.label)
  };
}

function selectGateType(label) {
  if (label === 'CONSEQUENTIAL') return 'explicit-confirm';
  if (label === 'TRANSACTIONAL') return 'summary-acknowledge';
  return 'none';
}

function buildGateContent(step, label, options = {}) {
  if (label === 'CONSEQUENTIAL') {
    return {
      title: step.cas_title || 'This action cannot be undone',
      body: step.cas_body || 'Read carefully before proceeding.',
      confirm_label: step.cas_confirm_label || 'I understand, proceed',
      cancel_label: 'Go back',
      risk_items: step.risks || [],
      trigger_kya_likha_hai: true
    };
  }

  if (label === 'TRANSACTIONAL') {
    return {
      title: 'Confirm your details',
      body: 'Review before submitting.',
      confirm_label: 'Confirm and submit',
      cancel_label: 'Edit',
      summary_fields: step.summary_fields || [],
      trigger_kya_likha_hai: false
    };
  }

  return null;
}

function buildPassCondition(label) {
  return {
    type: label === 'CONSEQUENTIAL' ? 'explicit-tap' : 'acknowledge',
    required_text: null,
    timeout_ms: null
  };
}

module.exports = { generateCASGate, selectGateType };
