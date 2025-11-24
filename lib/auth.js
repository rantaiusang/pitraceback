import dbConnect from '../lib/mongodb.js';
import User from '../models/User.js';
import { generateToken, validatePiAuth, generateGuestId, authRateLimiter } from '../lib/auth.js';

export default async function handler(req, res) {
    await dbConnect();

    const { method } = req;

    // Apply rate limiting to auth endpoints
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!authRateLimiter.check(clientIP)) {
        return res.status(429).json({
            success: false,
            message: 'Too many authentication attempts. Please try again later.'
        });
    }

    switch (method) {
        case 'POST':
            try {
                const { username, uid, walletAddress, loginType } = req.body;
                
                // Validate input
                if (!username || !uid || !loginType) {
                    return res.status(400).json({
                        success: false,
                        message: 'Missing required fields: username, uid, loginType'
                    });
                }

                // Validate Pi Network auth data
                if (loginType === 'pi' && !validatePiAuth(req.body)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid Pi Network authentication data'
                    });
                }

                // Find or create user
                let user = await User.findOne({ uid });
                
                if (!user) {
                    user = await User.create({
                        username,
                        uid,
                        walletAddress: loginType === 'pi' ? walletAddress : null,
                        loginType,
                        lastLogin: new Date()
                    });
                } else {
                    // Update last login and wallet address if changed
                    user.lastLogin = new Date();
                    if (loginType === 'pi' && walletAddress) {
                        user.walletAddress = walletAddress;
                    }
                    await user.save();
                }

                // Generate JWT token
                const token = generateToken(user);

                return res.status(200).json({ 
                    success: true, 
                    data: {
                        user: {
                            username: user.username,
                            uid: user.uid,
                            walletAddress: user.walletAddress,
                            loginType: user.loginType
                        },
                        token,
                        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
                    }
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
                
                const user = await User.findOne({ uid });
                if (!user) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'User not found' 
                    });
                }
                
                return res.status(200).json({ 
                    success: true, 
                    data: user 
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
