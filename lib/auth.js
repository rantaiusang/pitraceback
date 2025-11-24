// api/auth.js - VERSI SEDERHANA
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method } = req;

  switch (method) {
    case 'POST':
      try {
        const { username, uid, walletAddress, loginType } = req.body;
        
        console.log('Auth request:', { username, uid, loginType });
        
        // Validate input
        if (!username || !uid || !loginType) {
          return res.status(400).json({
            success: false,
            message: 'Missing required fields: username, uid, loginType'
          });
        }

        // Simulate user creation (without database)
        const mockUser = {
          username,
          uid,
          walletAddress: loginType === 'pi' ? walletAddress : null,
          loginType,
          lastLogin: new Date().toISOString()
        };

        // Generate mock token
        const mockToken = `mock_jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return res.status(200).json({ 
          success: true, 
          data: {
            user: {
              username: mockUser.username,
              uid: mockUser.uid,
              walletAddress: mockUser.walletAddress,
              loginType: mockUser.loginType
            },
            token: mockToken,
            expiresIn: '7d'
          },
          message: 'Authentication successful (mock mode)'
        });

      } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Authentication failed',
          error: error.message 
        });
      }

    case 'GET':
      try {
        const { uid } = req.query;
        
        if (!uid) {
          return res.status(400).json({ 
            success: false, 
            message: 'User ID required' 
          });
        }
        
        // Return mock user data
        return res.status(200).json({ 
          success: true, 
          data: {
            username: 'Mock User',
            uid: uid,
            loginType: 'guest',
            lastLogin: new Date().toISOString()
          } 
        });
        
      } catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to get user',
          error: error.message 
        });
      }

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ 
        success: false, 
        message: `Method ${method} not allowed` 
      });
  }
}
