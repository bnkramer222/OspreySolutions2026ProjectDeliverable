// MODEL - Account Management (Victoria)
// Accounts are saved in the "users" table in Postgres (see db/database.js).
// All functions are async: call them with "await".
const bcrypt = require("bcryptjs");
const db = require("../db/database");

// Columns renamed so the rest of the app sees the same field names as before
const COLUMNS = `id, name, email, password_hash AS "passwordHash", created_at AS "createdAt"`;

// Never send the password hash to a view
const publicInfo = ({ id, name, email, createdAt }) => ({
  id,
  name,
  email,
  createdAt,
});

module.exports = {
  // All accounts (without passwords)
  async getAll() {
    const users = await db.all(
      `SELECT ${COLUMNS} FROM users ORDER BY created_at`,
    );
    return users.map(publicInfo);
  },

  // Full account (including passwordHash) or undefined
  async findByEmail(email) {
    return db.get(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [
      email.trim().toLowerCase(),
    ]);
  },

  // Save a new account with a hashed password
  async create({ name, email, password }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.get(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [name.trim(), email.trim().toLowerCase(), passwordHash],
    );
    return publicInfo(user);
  },

  // Returns the account if the email + password match, otherwise null
  async checkLogin(email, password) {
    const user = await this.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return null;
    return publicInfo(user);
  },
};
