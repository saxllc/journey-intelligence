export default async function handler(req, res) {
  return res.status(200).json({
    sarvam_set: !!process.env.SARVAM_API_KEY,
    sarvam_length: process.env.SARVAM_API_KEY ? process.env.SARVAM_API_KEY.length : 0,
    anthropic_set: !!process.env.ANTHROPIC_API_KEY,
    anthropic_length: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.length : 0,
    node_env: process.env.NODE_ENV
  });
}
