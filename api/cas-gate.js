const { generateCASGate } = require('../src/cas-gate');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    const { step, options } = req.body;
    res.json(generateCASGate(step, options || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
