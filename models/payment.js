import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  // Basic Payment Information
  paymentId: {
    type: String,
    required: true,
    unique: true
  },
  identifier: {
    type: String,
    unique: true,
    sparse: true // For Pi Network payment identifiers
  },

  // User Information
  user: {
    uid: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    walletAddress: String
  },

  // Payment Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PI',
    enum: ['PI', 'USD', 'IDR'] // Pi coins, US Dollars, Indonesian Rupiah
  },
  memo: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Flexible object for additional data
    default: {}
  },

  // Payment Status
  status: {
    type: String,
    required: true,
    enum: [
      'pending',      // Payment created, waiting for user action
      'approved',     // User approved the payment
      'completed',    // Payment successfully processed
      'cancelled',    // User cancelled the payment
      'expired',      // Payment expired
      'failed',       // Payment failed
      'refunded'      // Payment was refunded
    ],
    default: 'pending'
  },

  // Pi Network Specific Fields
  piNetworkData: {
    transactionId: String,
    blockHash: String,
    fromAddress: String,
    toAddress: String,
    network: {
      type: String,
      enum: ['Pi Mainnet', 'Pi Testnet', 'Pi Sandbox']
    },
    txUrl: String, // Transaction explorer URL
    rawTransaction: mongoose.Schema.Types.Mixed // Raw transaction data
  },

  // Product/Service Information (if payment is for a product)
  product: {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    productName: String,
    productHash: String,
    quantity: {
      type: Number,
      default: 1
    }
  },

  // Service Information (if payment is for a service)
  service: {
    type: {
      type: String,
      enum: ['premium_tracking', 'api_access', 'custom_feature', 'other']
    },
    description: String,
    duration: String, // e.g., "30 days", "1 year"
    features: [String] // Array of features included
  },

  // Timestamps
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiration: 15 minutes from creation
      return new Date(Date.now() + 15 * 60 * 1000);
    }
  },
  approvedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  failedAt: Date,

  // Additional Metadata
  ipAddress: String,
  userAgent: String,
  deviceInfo: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Retry and Error Information
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  lastError: {
    message: String,
    code: String,
    timestamp: Date
  },

  // Webhook and Callback URLs
  callbackUrl: String,
  webhookUrl: String,
  webhookStatus: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'retrying'],
    default: 'pending'
  },
  webhookAttempts: {
    type: Number,
    default: 0
  },

  // Refund Information
  refund: {
    amount: Number,
    reason: String,
    processedAt: Date,
    refundTransactionId: String
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  return `${this.amount} ${this.currency}`;
});

// Virtual for payment age in minutes
paymentSchema.virtual('ageInMinutes').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60));
});

// Virtual to check if payment is expired
paymentSchema.virtual('isExpired').get(function() {
  return this.expiresAt && new Date() > this.expiresAt;
});

// Virtual for payment status description
paymentSchema.virtual('statusDescription').get(function() {
  const descriptions = {
    pending: 'Waiting for user approval',
    approved: 'Payment approved, processing...',
    completed: 'Payment completed successfully',
    cancelled: 'Payment was cancelled',
    expired: 'Payment expired',
    failed: 'Payment failed',
    refunded: 'Payment was refunded'
  };
  return descriptions[this.status] || 'Unknown status';
});

// Indexes for better query performance
paymentSchema.index({ paymentId: 1 });
paymentSchema.index({ identifier: 1 });
paymentSchema.index({ 'user.uid': 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });
paymentSchema.index({ expiresAt: 1 });
paymentSchema.index({ 'piNetworkData.transactionId': 1 });
paymentSchema.index({ 'product.productId': 1 });

// Static method to find pending payments that are expired
paymentSchema.statics.findExpiredPendingPayments = function() {
  return this.find({
    status: 'pending',
    expiresAt: { $lt: new Date() }
  });
};

// Static method to find payments by user
paymentSchema.statics.findByUser = function(uid, options = {}) {
  const query = { 'user.uid': uid };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.limit) {
    return this.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit);
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get payment statistics
paymentSchema.statics.getStats = async function(uid = null) {
  const matchStage = uid ? { 'user.uid': uid } : {};
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
  
  const total = await this.countDocuments(matchStage);
  const totalAmount = await this.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  return {
    total,
    totalAmount: totalAmount[0]?.total || 0,
    byStatus: stats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
      return acc;
    }, {})
  };
};

// Instance method to check if payment can be processed
paymentSchema.methods.canProcess = function() {
  return this.status === 'approved' && !this.isExpired;
};

// Instance method to mark as completed
paymentSchema.methods.markAsCompleted = function(transactionData = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  
  if (transactionData.transactionId) {
    this.piNetworkData = {
      ...this.piNetworkData,
      ...transactionData
    };
  }
  
  return this.save();
};

// Instance method to mark as failed
paymentSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.lastError = {
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date()
  };
  this.retryCount += 1;
  
  return this.save();
};

// Instance method to check if can be retried
paymentSchema.methods.canRetry = function() {
  return this.status === 'failed' && 
         this.retryCount < this.maxRetries && 
         !this.isExpired;
};

// Instance method to process refund
paymentSchema.methods.processRefund = function(amount, reason = '') {
  this.status = 'refunded';
  this.refund = {
    amount: amount || this.amount,
    reason,
    processedAt: new Date()
  };
  
  return this.save();
};

// Pre-save middleware to generate paymentId if not provided
paymentSchema.pre('save', function(next) {
  if (!this.paymentId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    this.paymentId = `pay_${timestamp}_${random}`.toUpperCase();
  }
  
  // Update expiration if status changes to pending and expired
  if (this.status === 'pending' && this.isExpired) {
    this.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  }
  
  next();
});

// Pre-save middleware to update timestamps based on status changes
paymentSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    const now = new Date();
    
    switch (this.status) {
      case 'approved':
        if (!this.approvedAt) this.approvedAt = now;
        break;
      case 'completed':
        if (!this.completedAt) this.completedAt = now;
        break;
      case 'cancelled':
        if (!this.cancelledAt) this.cancelledAt = now;
        break;
      case 'failed':
        if (!this.failedAt) this.failedAt = now;
        break;
    }
  }
  
  next();
});

// Static method to create a new payment from Pi Network data
paymentSchema.statics.createFromPiPayment = function(piPayment, user, product = null) {
  const paymentData = {
    identifier: piPayment.identifier,
    user: {
      uid: user.uid,
      username: user.username,
      walletAddress: user.walletAddress
    },
    amount: piPayment.amount,
    memo: piPayment.memo || '',
    metadata: piPayment.metadata || {},
    status: 'pending'
  };
  
  if (product) {
    paymentData.product = {
      productId: product._id,
      productName: product.name,
      productHash: product.hash,
      quantity: 1
    };
  }
  
  return this.create(paymentData);
};

// Method to format payment for frontend
paymentSchema.methods.toPaymentResponse = function() {
  const paymentObj = this.toObject();
  
  // Remove sensitive fields
  delete paymentObj.piNetworkData?.rawTransaction;
  delete paymentObj.__v;
  
  // Add virtuals
  paymentObj.formattedAmount = this.formattedAmount;
  paymentObj.ageInMinutes = this.ageInMinutes;
  paymentObj.isExpired = this.isExpired;
  paymentObj.statusDescription = this.statusDescription;
  
  return paymentObj;
};

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
