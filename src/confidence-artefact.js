// src/confidence-artefact.js
// Confidence Artefact Generator

function maskIdentifier(id) {
  if (!id || id.length < 4) return '****';
  return id.slice(0, 2) + '****' + id.slice(-2);
}

function generateConfidenceArtefact(transaction, options = {}) {
  const {
    action,
    timestamp,
    actor,
    recipient,
    changed = [],
    next_actions = [],
    reference_id,
    materiality = 'TRANSACTIONAL'
  } = transaction;

  return {
    type: 'confidence-artefact',
    version: '1.0',
    materiality,
    display: {
      what_happened: options.what_happened || `${action} completed`,
      who_received: recipient ? `Sent to: ${recipient}` : null,
      what_changed: changed,
      reference: reference_id ? `Ref: ${reference_id}` : null,
      timestamp: timestamp || new Date().toISOString()
    },
    next_actions,
    audit: {
      action,
      actor_masked: actor ? maskIdentifier(actor) : 'anonymous',
      materiality,
      timestamp: timestamp || new Date().toISOString()
    }
  };
}

function generateAadhaarKYCArtefact(kycResult = {}) {
  return generateConfidenceArtefact(
    {
      action: 'aadhaar-ekyc',
      timestamp: new Date().toISOString(),
      actor: kycResult.aadhaar_number || '000000000000',
      recipient: kycResult.requesting_entity || 'Requesting Entity',
      changed: [
        'Identity verified via Aadhaar OTP',
        'KYC status: Approved',
        'Consent recorded'
      ],
      next_actions: [
        { label: 'Download receipt', action_id: 'download-receipt' },
        { label: 'Return to app', action_id: 'return-to-app' }
      ],
      reference_id: kycResult.transaction_id || `TXN${Date.now()}`,
      materiality: 'CONSEQUENTIAL'
    },
    {
      what_happened:
        'Your Aadhaar eKYC is complete. Your identity has been verified and shared with consent.'
    }
  );
}

module.exports = { generateConfidenceArtefact, generateAadhaarKYCArtefact, maskIdentifier };
