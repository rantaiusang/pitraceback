import dbConnect from '../lib/mongodb.js';
import Product from '../models/Product.js';
import { authenticateToken, hasPermission, apiRateLimiter } from '../lib/auth.js';

export default async function handler(req, res) {
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
        case 'GET':
            try {
                const { userId, productId } = req.query;
                
                if (productId) {
                    // Get single product
                    const product = await Product.findById(productId);
                    if (!product) {
                        return res.status(404).json({ 
                            success: false, 
                            message: 'Product not found' 
                        });
                    }
                    return res.status(200).json({ 
                        success: true, 
                        data: product 
                    });
                } else if (userId) {
                    // Get user's products
                    const products = await Product.find({ owner: userId }).sort({ createdAt: -1 });
                    return res.status(200).json({ 
                        success: true, 
                        data: products 
                    });
                } else {
                    // Get all public products (for search)
                    const products = await Product.find({ isActive: true });
                    return res.status(200).json({ 
                        success: true, 
                        data: products 
                    });
                }
            } catch (error) {
                console.error('Get products error:', error);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to fetch products',
                    error: error.message 
                });
            }

        case 'POST':
            // Authenticate for product creation
            try {
                await new Promise((resolve, reject) => {
                    authenticateToken(req, res, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            } catch (authError) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to create products'
                });
            }

            try {
                const product = await Product.create({
                    ...req.body,
                    owner: req.user.uid // Set owner from authenticated user
                });
                
                return res.status(201).json({ 
                    success: true, 
                    data: product 
                });
            } catch (error) {
                console.error('Create product error:', error);
                if (error.code === 11000) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Product hash already exists' 
                    });
                }
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to create product',
                    error: error.message 
                });
            }

        case 'PUT':
            // Authenticate for product updates
            try {
                await new Promise((resolve, reject) => {
                    authenticateToken(req, res, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            } catch (authError) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to update products'
                });
            }

            try {
                const product = await Product.findById(req.body.id);
                
                if (!product) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'Product not found' 
                    });
                }

                // Check permission
                if (!hasPermission(req.user, product.owner)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. You can only update your own products.'
                    });
                }

                const updatedProduct = await Product.findByIdAndUpdate(
                    req.body.id,
                    req.body,
                    { new: true, runValidators: true }
                );
                
                return res.status(200).json({ 
                    success: true, 
                    data: updatedProduct 
                });
            } catch (error) {
                console.error('Update product error:', error);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to update product',
                    error: error.message 
                });
            }

        case 'DELETE':
            // Authenticate for product deletion
            try {
                await new Promise((resolve, reject) => {
                    authenticateToken(req, res, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            } catch (authError) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required to delete products'
                });
            }

            try {
                const product = await Product.findById(req.body.id);
                
                if (!product) {
                    return res.status(404).json({ 
                        success: false, 
                        message: 'Product not found' 
                    });
                }

                // Check permission
                if (!hasPermission(req.user, product.owner)) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. You can only delete your own products.'
                    });
                }

                await Product.findByIdAndDelete(req.body.id);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Product deleted successfully' 
                });
            } catch (error) {
                console.error('Delete product error:', error);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to delete product',
                    error: error.message 
                });
            }

        default:
            res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
            return res.status(405).json({ 
                success: false, 
                message: `Method ${method} not allowed` 
            });
    }
}
