// ============================================================
// DATABASE - shared Postgres connection (whole app)
// Every model that needs the database does:
//   const db = require('../db/database');
// The database is hosted on Neon (connected through Vercel).
// The connection string comes from the DATABASE_URL setting:
//   - on Vercel: set automatically by the Neon integration
//   - locally:   put it in your .env file
//
// Tables are created automatically the first time the app runs.
//
// Tables:
//   files  -> one row per uploaded survey file + its tags (Brandon, story #41)
// Later, teammates can add their own tables in the same place, e.g.
//   users      -> accounts (Account Management)
//   responses  -> survey rows read from each file (Report Generation)
//
// IMPORTANT: Postgres calls are async. Always use "await":
//   const rows = await db.all("SELECT * FROM files WHERE type = $1", [type]);
// Postgres uses $1, $2, $3... for values (SQLite used ?).
// ============================================================

const pool = require("./pool");

// ---- Create tables (only if they don't exist yet) ----
// "IF NOT EXISTS" means restarting the app never wipes your data.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS files (
    id          SERIAL  PRIMARY KEY,
    type        TEXT    NOT NULL CHECK (type IN ('pre', 'post')), -- which section
    name        TEXT    NOT NULL,             -- file name, e.g. survey.csv
    size        INTEGER NOT NULL DEFAULT 0,   -- in bytes
    content     BYTEA,                        -- the file itself (Vercel can't save files to disk)
    program     TEXT,                         -- My Money Grows / Collegiate
    school      TEXT,                         -- school or university
    cohort      TEXT,                         -- e.g. Fall 2026
    year        TEXT,                         -- academic year, e.g. 2026-27
    uploaded_at TEXT    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    UNIQUE (type, name)                       -- same name in same section = same file (replace)
  );

  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT   NOT NULL,
    email         TEXT   NOT NULL UNIQUE,     -- stored lowercase
    password_hash TEXT   NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Runs the CREATE TABLE statements once per server start.
// Every query below waits for this to finish first.
const ready = pool.query(SCHEMA);

// ---- Helpers (same idea as better-sqlite3, but async) ----

// Any SQL. Returns the full result ({ rows, rowCount }).
async function query(sql, params = []) {
  await ready;
  return pool.query(sql, params);
}

// SELECT that returns many rows -> array
async function all(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

// SELECT that returns one row -> object (or undefined)
async function get(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0];
}

// INSERT / UPDATE / DELETE -> { rowCount, rows }
// Add "RETURNING id" to an INSERT to get the new id back in rows[0].id
async function run(sql, params = []) {
  const result = await query(sql, params);
  return { rowCount: result.rowCount, rows: result.rows };
}

module.exports = { pool, ready, query, all, get, run };
