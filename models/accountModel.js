// Account Management — shared SQLite database (data/app.db).
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const fs = require('fs');
const path = require('path');

// This table shares the database with the group's existing files table.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reset_token_hash TEXT,
    reset_expires_at INTEGER
  );
`);

// One-time, non-destructive import of accounts from the older JSON storage.
// Never overwrites an account already present in SQLite.
const legacyPath = path.join(__dirname, '..', 'data', 'users.json');
const migration = db.transaction((users) => {
  const insert = db.prepare(`INSERT OR IGNORE INTO users
    (id, first_name, last_name, email, password_hash, created_at, reset_token_hash, reset_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const u of users) {
    if (!u || !u.email || !u.passwordHash) continue;
    const parts = String(u.name || '').trim().split(/\s+/).filter(Boolean);
    const first = String(u.firstName || parts[0] || '').trim();
    const last = String(u.lastName !== undefined ? u.lastName : parts.slice(1).join(' ')).trim();
    if (!first || !last) continue;
    insert.run(Number.isSafeInteger(Number(u.id)) ? Number(u.id) : null,
      first, last, String(u.email).trim().toLowerCase(), u.passwordHash,
      u.createdAt || new Date().toISOString(), u.resetTokenHash || null, u.resetExpiresAt || null);
  }
});
if (fs.existsSync(legacyPath)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    if (Array.isArray(legacy)) migration(legacy);
  } catch (err) {
    // Do not start with a partial migration if the legacy file is malformed.
    throw new Error(`Could not import legacy users.json: ${err.message}`);
  }
}

const publicInfo = (row) => row ? ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  name: `${row.first_name} ${row.last_name}`.trim(),
  email: row.email,
  createdAt: row.created_at,
}) : null;
const byEmail = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
const byId = db.prepare('SELECT * FROM users WHERE id = ?');
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

module.exports = {
  getAll() {
    return db.prepare('SELECT * FROM users ORDER BY first_name, last_name').all().map(publicInfo);
  },
  findByEmail(email) { return publicInfo(byEmail.get(normalizeEmail(email))); },
  findById(id) { return publicInfo(byId.get(id)); },
  create({ firstName, lastName, email, password }) {
    const result = db.prepare(`INSERT INTO users (first_name, last_name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(firstName.trim(), lastName.trim(), normalizeEmail(email),
      bcrypt.hashSync(password, 10), new Date().toISOString());
    return publicInfo(byId.get(result.lastInsertRowid));
  },
  checkLogin(email, password) {
    const row = byEmail.get(normalizeEmail(email));
    return row && typeof row.password_hash === 'string' && bcrypt.compareSync(String(password || ''), row.password_hash)
      ? publicInfo(row) : null;
  },
  verifyPassword(id, password) {
    const row = byId.get(id);
    return !!row && typeof row.password_hash === 'string' && bcrypt.compareSync(String(password || ''), row.password_hash);
  },
  changePassword(id, password) {
    return db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), id).changes > 0;
  },
  deleteAccount(id) { return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0; },
  saveResetToken(email, tokenHash, expiresAt) {
    return db.prepare('UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE email = ? COLLATE NOCASE')
      .run(tokenHash, expiresAt, normalizeEmail(email)).changes > 0;
  },
  resetByToken(tokenHash, password) {
    return db.prepare(`UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL
      WHERE reset_token_hash = ? AND reset_expires_at > ?`)
      .run(bcrypt.hashSync(password, 10), tokenHash, Date.now()).changes > 0;
  },
  validResetToken(tokenHash) {
    return !!db.prepare('SELECT id FROM users WHERE reset_token_hash = ? AND reset_expires_at > ?')
      .get(tokenHash, Date.now());
  },
};
