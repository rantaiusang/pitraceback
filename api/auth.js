export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const { username, uid, loginType } = req.body;
    // Mock response
    return res.status(200).json({
      success: true,
      data: {
        user: { username, uid, loginType },
        token: 'mock-token',
        expiresIn: '7d'
      }
    });
  }

  // If not POST, return 405
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
