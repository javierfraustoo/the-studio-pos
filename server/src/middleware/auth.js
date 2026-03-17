const crypto = require('crypto');
const { getDb } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'studio-pos-secret-dev-key-change-in-prod';

// Simple JWT-like token (no external dependency needed)
function createToken(payload, expiresInMs = 24 * 60 * 60 * 1000) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + expiresInMs;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Express middleware — attaches req.user = { id, name, role }
function authMiddleware(req, res, next) {
  // Skip auth for login endpoint and health
  // When mounted on /api, req.path is relative (e.g. /auth/login not /api/auth/login)
  if (req.path === '/auth/login' || req.path === '/auth/users-list' || req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Verify user still exists and is active
  const db = getDb();
  const user = db.prepare('SELECT id, name, role, is_active FROM users WHERE id = ?').get(payload.userId);
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }

  req.user = { id: user.id, name: user.name, role: user.role };
  next();
}

// Role check middleware factory
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { createToken, verifyToken, authMiddleware, requireRole };
