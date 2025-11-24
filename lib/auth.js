import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// JWT Secret Key (should be in environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'pi-trace-default-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @param {string} user.uid - User ID
 * @param {string} user.username - Username
 * @param {string} user.loginType - Login type (pi/guest)
 * @returns {string} JWT token
 */
export function generateToken(user) {
    const payload = {
        uid: user.uid,
        username: user.username,
        loginType: user.loginType,
        walletAddress: user.walletAddress
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
        issuer: 'pi-trace-backend',
        subject: user.uid
    });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
}

/**
 * Middleware to authenticate requests
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
}

/**
 * Middleware for optional authentication
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = verifyToken(token);
            req.user = decoded;
        } catch (error) {
            // Continue without user info if token is invalid
            req.user = null;
        }
    }

    next();
}

/**
 * Generate hash for passwords (if needed in future)
 * @param {string} password - Plain text password
 * @returns {string} Hashed password
 */
export async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {boolean} True if password matches
 */
export async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate random API key
 * @param {number} length - Key length
 * @returns {string} Random API key
 */
export function generateApiKey(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Validate Pi Network authentication data
 * @param {Object} authData - Pi Network auth data
 * @returns {boolean} True if valid
 */
export function validatePiAuth(authData) {
    if (!authData || typeof authData !== 'object') {
        return false;
    }

    const requiredFields = ['uid', 'username', 'accessToken'];
    return requiredFields.every(field => authData[field]);
}

/**
 * Generate guest user ID
 * @returns {string} Guest user ID
 */
export function generateGuestId() {
    return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if user has permission to access resource
 * @param {Object} user - User object from token
 * @param {string} resourceOwnerId - Resource owner ID
 * @returns {boolean} True if user has permission
 */
export function hasPermission(user, resourceOwnerId) {
    if (!user || !resourceOwnerId) {
        return false;
    }

    // User can access their own resources
    if (user.uid === resourceOwnerId) {
        return true;
    }

    // Admin users can access all resources (if implemented)
    if (user.role === 'admin') {
        return true;
    }

    return false;
}

/**
 * Sanitize user data for response (remove sensitive fields)
 * @param {Object} user - User object from database
 * @returns {Object} Sanitized user object
 */
export function sanitizeUser(user) {
    if (!user || typeof user !== 'object') {
        return user;
    }

    const { password, accessToken, __v, ...sanitized } = user;
    
    // Convert MongoDB document to plain object if needed
    if (user._id && typeof user._id === 'object') {
        sanitized.id = user._id.toString();
        delete sanitized._id;
    }

    return sanitized;
}

/**
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis or dedicated rate limiting middleware
 */
export class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    check(identifier) {
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Clean old entries
        for (const [key, timestamp] of this.requests.entries()) {
            if (timestamp < windowStart) {
                this.requests.delete(key);
            }
        }

        const userRequests = Array.from(this.requests.entries())
            .filter(([key]) => key.startsWith(identifier))
            .map(([, timestamp]) => timestamp)
            .filter(timestamp => timestamp > windowStart);

        if (userRequests.length >= this.maxRequests) {
            return false; // Rate limit exceeded
        }

        this.requests.set(`${identifier}_${now}`, now);
        return true; // Within rate limit
    }
}

// Create rate limiter instances
export const authRateLimiter = new RateLimiter(5, 15 * 60 * 1000); // 5 attempts per 15 minutes
export const apiRateLimiter = new RateLimiter(100, 60 * 60 * 1000); // 100 requests per hour

export default {
    generateToken,
    verifyToken,
    authenticateToken,
    optionalAuth,
    hashPassword,
    comparePassword,
    generateApiKey,
    validatePiAuth,
    generateGuestId,
    hasPermission,
    sanitizeUser,
    authRateLimiter,
    apiRateLimiter
};
