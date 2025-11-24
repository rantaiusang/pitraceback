import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  uid: {
    type: String,
    required: true,
    unique: true
  },
  walletAddress: String,
  loginType: {
    type: String,
    enum: ['pi', 'guest'],
    required: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }]
}, {
  timestamps: true
});

export default mongoose.models.User || mongoose.model('User', userSchema);
