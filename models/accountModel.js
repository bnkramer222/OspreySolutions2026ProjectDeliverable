// MODEL - Account Management (Victoria)
// Accounts are saved in the "users" table in Postgres (see db/database.js).
// Sign-up is locked down: the very first account is approved automatically,
// and every later sign-up waits until an approved staff member approves it
// on the Account page. This keeps student survey data private.
// All functions are async: call them with "await".
const bcrypt = require("bcryptjs");
const db = require("../db/database");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Turns a database row into the account object the app uses.
// Never includes the password hash.
const publicInfo = (row) =>
  row
    ? {
        id: row.id,
        firstName: row.first_name || row.name.split(" ")[0] || "",
        lastName: row.last_name || row.name.split(" ").slice(1).join(" "),
        name: row.name,
        email: row.email,
        approved: row.approved !== false,
        createdAt: row.created_at,
      }
    : null;

module.exports = {
  // Approved accounts (without passwords)
  async getAll() {
    const rows = await db.all("SELECT * FROM users WHERE approved ORDER BY created_at");
    return rows.map(publicInfo);
  },

  // Sign-ups waiting for approval
  async getPending() {
    const rows = await db.all("SELECT * FROM users WHERE NOT approved ORDER BY created_at");
    return rows.map(publicInfo);
  },

  async approve(id) {
    await db.run("UPDATE users SET approved = true WHERE id = $1", [id]);
  },

  // Turning down a sign-up deletes it (only pending accounts)
  async deny(id) {
    await db.run("DELETE FROM users WHERE id = $1 AND NOT approved", [id]);
  },

  // Account for this email, or null
  async findByEmail(email) {
    return publicInfo(
      await db.get("SELECT * FROM users WHERE email = $1", [normalizeEmail(email)]),
    );
  },

  // Save a new account with a hashed password
  async create({ firstName, lastName, email, password }) {
    const first = String(firstName).trim();
    const last = String(lastName).trim();
    // approved = true only if nobody is approved yet (the first account)
    const row = await db.get(
      `INSERT INTO users (name, first_name, last_name, email, password_hash, approved)
       VALUES ($1, $2, $3, $4, $5, NOT EXISTS (SELECT 1 FROM users WHERE approved)) RETURNING *`,
      [`${first} ${last}`.trim(), first, last, normalizeEmail(email), await bcrypt.hash(password, 10)],
    );
    return publicInfo(row);
  },

  // Returns the account if the email + password match, otherwise null
  async checkLogin(email, password) {
    const row = await db.get("SELECT * FROM users WHERE email = $1", [normalizeEmail(email)]);
    if (!row || !(await bcrypt.compare(password, row.password_hash))) return null;
    return publicInfo(row);
  },

  // true if this is the account's current password
  async verifyPassword(id, password) {
    const row = await db.get("SELECT password_hash FROM users WHERE id = $1", [id]);
    return Boolean(row) && bcrypt.compare(password, row.password_hash);
  },

  async changePassword(id, newPassword) {
    await db.run("UPDATE users SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(newPassword, 10),
      id,
    ]);
  },

  async deleteAccount(id) {
    await db.run("DELETE FROM users WHERE id = $1", [id]);
  },
};
