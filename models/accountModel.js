// MODEL - Account Management (Victoria)
// Accounts are saved in the "users" table in Postgres (see db/database.js).
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
        createdAt: row.created_at,
      }
    : null;

module.exports = {
  // All accounts (without passwords)
  async getAll() {
    const rows = await db.all("SELECT * FROM users ORDER BY created_at");
    return rows.map(publicInfo);
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
    const row = await db.get(
      `INSERT INTO users (name, first_name, last_name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
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
