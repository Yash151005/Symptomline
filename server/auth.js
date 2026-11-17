import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import db from './db.js';

export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS) || 14;
export const MIN_PASSWORD_LENGTH = 8;

// Compared against when the email does not exist, so a failed login takes the
// same time whether or not the account exists (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('noted-timing-equalizer', 10);

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// Opaque random session tokens stored server-side (revocable, unlike JWTs).
export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createSession(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400e3).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

function bearerToken(req) {
  const header = req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function authMiddleware(req, res, next) {
  // Tokens are accepted only in the Authorization header. Query-string tokens
  // end up in server logs, proxies and browser history.
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session || !session.expires_at || Date.parse(session.expires_at) <= Date.now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = { id: user.id, email: user.email, name: user.name };
  req.sessionToken = token;

  const profile = db
    .prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1')
    .get(user.id);
  if (profile) {
    req.profileId = profile.id;
  }
  next();
}

export function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function logoutEverywhere(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function purgeExpiredSessions() {
  return db.prepare('DELETE FROM sessions WHERE expires_at IS NULL OR expires_at <= ?').run(new Date().toISOString()).changes;
}

export function registerUser(name, email, password) {
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Enter a valid email address');

  const id = uuid();
  const profileId = uuid();
  const hash = hashPassword(password);
  let token;

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)').run(id, String(name).trim(), normalizedEmail, hash);
    db.prepare('INSERT INTO profiles (id, user_id, name, relation) VALUES (?, ?, ?, ?)').run(profileId, id, String(name).trim(), 'self');
    token = createSession(id);
  });

  try {
    tx();
    return { user: { id, name, email: normalizedEmail, profileId }, token };
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error('Email already registered');
    throw e;
  }
}

export function loginUser(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
  const ok = verifyPassword(String(password), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    throw new Error('Invalid email or password');
  }
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ? LIMIT 1').get(user.id);
  const token = createSession(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, profileId: profile?.id },
    token,
  };
}

/** Right to erasure (GDPR Art. 17 / India DPDP Act s.12). Requires the password. */
export function deleteAccount(userId, password) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    throw new Error('Password is incorrect');
  }
  const profileIds = db.prepare('SELECT id FROM profiles WHERE user_id = ?').all(userId).map((p) => p.id);
  db.transaction(() => {
    for (const pid of profileIds) {
      db.prepare('DELETE FROM share_access_log WHERE share_id IN (SELECT id FROM share_links WHERE profile_id = ?)').run(pid);
      db.prepare('DELETE FROM share_links WHERE profile_id = ?').run(pid);
      db.prepare('DELETE FROM audit_ledger WHERE profile_id = ?').run(pid);
      db.prepare('DELETE FROM daily_checkins WHERE profile_id = ?').run(pid);
      db.prepare('DELETE FROM symptom_entries WHERE profile_id = ?').run(pid);
      db.prepare('DELETE FROM treatments WHERE profile_id = ?').run(pid);
    }
    db.prepare('DELETE FROM profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
}
