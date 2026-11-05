const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env file (see README).",
  );
}

// One shared connection pool for the whole app.
// Kept small because Vercel runs many short-lived copies of the server.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

module.exports = pool;
