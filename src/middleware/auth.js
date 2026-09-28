import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

// In-memory cache for decoded user sessions to prevent database connection starvation
const userCache = new Map();
const USER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_12345');
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Check in-memory user cache first
    const cached = userCache.get(decoded.id);
    if (cached && (Date.now() - cached.timestamp < USER_CACHE_TTL)) {
      req.user = cached.user;
      return next();
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found in system.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email address.' });
    }

    // Attach user (without password) to request and cache it
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
    };

    userCache.set(decoded.id, {
      user: userData,
      timestamp: Date.now()
    });

    req.user = userData;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal auth error', details: error.message });
  }
};
