export default function handler(req, res) {
  res.status(200).json({ 
    message: 'Welcome to PI TRACE Backend API',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      payments: '/api/payments',
      users: '/api/users'
    },
    status: 'OK'
  });
}
