const { classify } = require('../src/classify');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  try {
    res.json(classify(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
