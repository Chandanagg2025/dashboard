/**
 * auth.js — JWT middleware and password helpers
 */
'use strict';

const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const SECRET  = process.env.JWT_SECRET || 'ocems_super_secret_2024_change_in_prod';
const COOKIE  = 'ocems_token';

/** Hash a plain password */
async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

/** Compare plain password to stored hash */
async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Sign a JWT for a user object */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, site_id: user.site_id },
    SECRET,
    { expiresIn: '12h' }
  );
}

/** Verify a JWT; returns decoded payload or null */
function verifyToken(token) {
  try { return jwt.verify(token, SECRET); }
  catch (_) { return null; }
}

/**
 * Express middleware — requires a valid JWT cookie.
 * Optionally restricts to specific roles.
 *
 * Usage:
 *   router.get('/protected', requireAuth(), handler)
 *   router.get('/admin-only', requireAuth(['admin']), handler)
 */
function requireAuth(roles = []) {
  return (req, res, next) => {
    const token = req.cookies?.[COOKIE] || req.headers['authorization']?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const user = verifyToken(token);
    if (!user)  return res.status(401).json({ success: false, error: 'Invalid or expired token' });

    if (roles.length && !roles.includes(user.role)) {
      return res.status(403).json({ success: false, error: `Access denied. Required role: ${roles.join(' or ')}` });
    }

    req.user = user;
    next();
  };
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, requireAuth, COOKIE, SECRET };
