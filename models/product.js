import mongoose from 'mongoose';

const supplyChainStepSchema = new mongoose.Schema({
  stage: {
    type: String,
    required: true,
    enum: ['manufactured', 'shipped', 'in_transit', 'delivered']
  },
  location: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  description: String,
  status: {
    type: String,
    default: 'pending'
  }
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['electronics', 'clothing', 'food', 'other']
  },
  description: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1
  },
  unit: {
    type: String,
    default: 'pcs',
    enum: ['pcs', 'kg', 'box', 'unit']
  },
  price: {
    type: Number,
    default: 0,
    min: 0
  },
  origin: {
    country: {
      type: String,
      default: 'Indonesia'
    },
    city: String
  },
  hash: {
    type: String,
    required: true,
    unique: true
  },
  qrCode: String,
  uploadDate: {
    type: Date,
    default: Date.now
  },
  owner: {
    type: String,
    required: true
  },
  supplyChain: [supplyChainStepSchema],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Generate hash before saving
productSchema.pre('save', function(next) {
  if (!this.hash) {
    const prefix = this.category.substring(0, 3).toUpperCase();
    const random = Math.random().toString(36).substr(2, 9).toUpperCase();
    this.hash = `${prefix}_${random}`;
  }
  next();
});

export default mongoose.models.Product || mongoose.model('Product', productSchema);
