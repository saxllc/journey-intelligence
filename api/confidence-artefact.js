const { generateConfidenceArtefact } = require('../src/confidence-artefact');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    const { transaction, options } = req.body;
    res.json(generateConfidenceArtefact(transaction, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
