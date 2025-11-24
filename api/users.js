import dbConnect from '../lib/mongodb.js';
import User from '../models/User.js';

export default async function handler(req, res) {
  await dbConnect();

  const { method } = req;

  switch (method) {
    case 'GET':
      try {
        const { uid } = req.query;
        if (!uid) {
          return res.status(400).json({ success: false, message: 'User ID required' });
        }
        
        const user = await User.findOne({ uid });
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        return res.status(200).json({ success: true, data: user });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

    case 'PUT':
      try {
        const { uid, ...updateData } = req.body;
        
        const user = await User.findOneAndUpdate(
          { uid },
          updateData,
          { new: true, runValidators: true }
        );
        
        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        return res.status(200).json({ success: true, data: user });
      } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

    default:
      res.setHeader('Allow', ['GET', 'PUT']);
      return res.status(405).json({ success: false, message: `Method ${method} not allowed` });
  }
}
