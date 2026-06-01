export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime().toFixed(0) + 's',
    time: new Date().toISOString()
  });
}
