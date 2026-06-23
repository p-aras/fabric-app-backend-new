import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export const authMiddleware = async (req, res, next) => {
  console.log('Auth Middleware: Incoming request', req.method, req.path);
  console.log('Auth Middleware: Authorization header', req.headers.authorization);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_12345');
      console.log('Auth Middleware: Token verified. Decoded payload:', decoded);
    } catch (err) {
      console.error('Auth Middleware: Token verification failed.', err);
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    console.log('Auth Middleware: Looking up user with ID:', decoded.id);
    const user = await User.findByPk(decoded.id);
    if (!user) {
      console.error('Auth Middleware: No user found for ID', decoded.id);
      return res.status(401).json({ error: 'User not found in system.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email address.' });
    }

    // Attach user (without password) to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal auth error', details: error.message });
  }
};
