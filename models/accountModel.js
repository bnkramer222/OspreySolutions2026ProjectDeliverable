// MODEL - Account Management (Victoria)
// Accounts are saved in data/users.json. Swap for a database later.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_FILE = path.join(__dirname, "..", "data", "users.json");

// Create data/users.json if it doesn't exist
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const readAll = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const saveAll = (users) =>
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));

// Never send the password hash to a view
const publicInfo = ({ id, name, email, createdAt }) => ({
  id,
  name,
  email,
  createdAt,
});

module.exports = {
  // All accounts (without passwords)
  getAll() {
    return readAll().map(publicInfo);
  },

  findByEmail(email) {
    return readAll().find((u) => u.email === email.trim().toLowerCase());
  },

  // Save a new account with a hashed password
  create({ name, email, password }) {
    const users = readAll();
    const user = {
      id: Date.now(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: bcrypt.hashSync(password, 10),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveAll(users);
    return publicInfo(user);
  },

  // Returns the account if the email + password match, otherwise null
  checkLogin(email, password) {
    const user = this.findByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) return null;
    return publicInfo(user);
  },
};
