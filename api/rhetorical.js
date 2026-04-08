const { generateRhetoricalLayer } = require('../src/rhetorical');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    const { step, context } = req.body;
    const result = await generateRhetoricalLayer(step, context || {});
    res.json(result);
  } catch (e) {
    console.error('Rhetorical error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
