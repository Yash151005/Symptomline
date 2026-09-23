import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from './db.js';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Simple token-based auth — no JWT, just random tokens stored in DB
export function generateToken() {
  return uuid() + '-' + uuid(); // long random token
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = header.slice(7);
  const session = db
    .prepare('SELECT * FROM sessions WHERE token = ?')
    .get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = { id: user.id, email: user.email, name: user.name };

  const profile = db
    .prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1')
    .get(user.id);
  if (profile) {
    req.profileId = profile.id;
  }
  next();
}

export function registerUser(name, email, password) {
  const id = uuid();
  const profileId = uuid();
  const hash = hashPassword(password);
  const token = generateToken();

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, name, email, hash);
    db.prepare('INSERT INTO profiles (id, user_id, name, relation) VALUES (?, ?, ?, ?)').run(profileId, id, name, 'self');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, id);
  });

  try {
    tx();
    return { user: { id, name, email, profileId }, token };
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error('Email already registered');
    throw e;
  }
}

export function loginUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid email or password');
  }
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1').get(user.id);
  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, profileId: profile?.id },
    token,
  };
}
