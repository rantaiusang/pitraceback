import dbConnect from '../lib/mongodb.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import { authenticateToken, apiRateLimiter } from '../lib/auth.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    await dbConnect();

    const { method } = req;

    // Apply rate limiting
    const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!apiRateLimiter.check(clientIP)) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.'
        });
    }

    switch (method) {
        case 'POST':
            return await handleCreatePayment(req, res);
        
        case 'GET':
            return await handleGetPayments(req, res);
        
        case 'PUT':
            return await handleUpdatePayment(req, res);
        
        default:
            res.setHeader('Allow', ['GET', 'POST', 'PUT']);
            return res.status(405).json({ 
                success: false, 
                message: `Method ${method} not allowed` 
            });
    }
}

// Create new payment
async function handleCreatePayment(req, res) {
    try {
        // Authenticate user
        await new Promise((resolve, reject) => {
            authenticateToken(req, res, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        const { amount, memo, metadata, productId, serviceType } = req.body;
        
        // Validate required fields
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid amount is required'
            });
        }

        let product = null;
        if (productId) {
            product = await Product.findById(productId);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }
        }

        // Create payment data
        const paymentData = {
            user: {
                uid: req.user.uid,
                username: req.user.username,
                walletAddress: req.user.walletAddress
            },
            amount,
            memo: memo || 'PI TRACE Payment',
            metadata: metadata || {},
            status: 'pending'
        };

        // Add product or service information
        if (product) {
            paymentData.product = {
                productId: product._id,
                productName: product.name,
                productHash: product.hash,
                quantity: 1
            };
        } else if (serviceType) {
            paymentData.service = {
                type: serviceType,
                description: getServiceDescription(serviceType),
                duration: '30 days',
                features: getServiceFeatures(serviceType)
            };
        }

        // Create payment in database
        const payment = await Payment.create(paymentData);

        return res.status(201).json({ 
            success: true, 
            data: payment.toPaymentResponse(),
            message: 'Payment created successfully. Please approve in your Pi Wallet.'
        });

    } catch (error) {
        console.error('Create payment error:', error);
        
        if (error.name === 'UnauthorizedError') {
            return res.status(401).json({
                success: false,
                message: 'Authentication required to create payments'
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment',
            error: error.message 
        });
    }
}

// Get payments (with optional filtering)
async function handleGetPayments(req, res) {
    try {
        // Optional authentication - if authenticated, return user's payments
        // If not authenticated, return public payment stats only
        const { userId, status, limit, page = 1 } = req.query;
        
        let payments;
        let total = 0;

        if (userId) {
            // Get specific user's payments
            payments = await Payment.findByUser(userId, { status, limit: parseInt(limit) || 10 });
            total = await Payment.countDocuments({ 'user.uid': userId });
        } else {
            // Get payment statistics (public)
            const stats = await Payment.getStats();
            return res.status(200).json({
                success: true,
                data: {
                    stats,
                    recentPayments: await Payment.find({ status: 'completed' })
                        .sort({ completedAt: -1 })
                        .limit(5)
                        .select('paymentId amount user.username createdAt')
                }
            });
        }

        const pageSize = parseInt(limit) || 10;
        const totalPages = Math.ceil(total / pageSize);

        return res.status(200).json({
            success: true,
            data: {
                payments: payments.map(payment => payment.toPaymentResponse()),
                pagination: {
                    page: parseInt(page),
                    pageSize,
                    total,
                    totalPages
                }
            }
        });

    } catch (error) {
        console.error('Get payments error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch payments',
            error: error.message 
        });
    }
}

// Update payment (for webhooks and status updates)
async function handleUpdatePayment(req, res) {
    try {
        const { paymentId, status, transactionData, identifier } = req.body;

        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'Payment ID is required'
            });
        }

        const payment = await Payment.findOne({ 
            $or: [
                { paymentId },
                { identifier }
            ]
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        // Update payment based on status
        switch (status) {
            case 'approved':
                payment.status = 'approved';
                payment.approvedAt = new Date();
                break;
            
            case 'completed':
                if (transactionData) {
                    await payment.markAsCompleted(transactionData);
                } else {
                    payment.status = 'completed';
                    payment.completedAt = new Date();
                }
                break;
            
            case 'cancelled':
                payment.status = 'cancelled';
                payment.cancelledAt = new Date();
                break;
            
            case 'failed':
                await payment.markAsFailed(
                    new Error(transactionData?.error || 'Payment failed')
                );
                break;
            
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status update'
                });
        }

        await payment.save();

        return res.status(200).json({
            success: true,
            data: payment.toPaymentResponse(),
            message: `Payment ${status} successfully`
        });

    } catch (error) {
        console.error('Update payment error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to update payment',
            error: error.message 
        });
    }
}

// Helper functions for service descriptions
function getServiceDescription(serviceType) {
    const descriptions = {
        'premium_tracking': 'Premium supply chain tracking features',
        'api_access': 'API access for developers',
        'custom_feature': 'Custom feature implementation',
        'other': 'Other services'
    };
    return descriptions[serviceType] || 'Service payment';
}

function getServiceFeatures(serviceType) {
    const features = {
        'premium_tracking': [
            'Advanced analytics',
            'Real-time tracking',
            'Priority support',
            'Custom reports'
        ],
        'api_access': [
            'API key generation',
            'High rate limits',
            'Webhook support',
            'Documentation access'
        ],
        'custom_feature': [
            'Custom development',
            'Dedicated support',
            'Feature customization'
        ]
    };
    return features[serviceType] || ['Basic features'];
}
