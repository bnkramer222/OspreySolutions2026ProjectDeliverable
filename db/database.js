// ============================================================
// DATABASE - shared SQLite connection (whole app)
// Every model that needs the database does:
//   const db = require('../db/database');
// The database is ONE file: <project>/data/app.db
// It is created automatically the first time the app starts.
//
// Tables:
//   files  -> one row per uploaded survey file + its tags (Brandon, story #41)
// Later, teammates can add their own tables in the same place, e.g.
//   users      -> accounts (Account Management)
//   responses  -> survey rows read from each file (Report Generation)
// ============================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3"); // SQLite library (npm install better-sqlite3)

// Make sure the data folder exists, then open (or create) the database file
const DATA_DIR = path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "app.db"));

// Recommended SQLite settings: safer writes, and enforce links between tables
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---- Create tables (only if they don't exist yet) ----
// "IF NOT EXISTS" means restarting the app never wipes your data.
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL CHECK (type IN ('pre', 'post')), -- which section
    name        TEXT    NOT NULL,             -- file name, e.g. survey.csv
    size        INTEGER NOT NULL DEFAULT 0,   -- in bytes
    program     TEXT,                         -- My Money Grows / Collegiate
    school      TEXT,                         -- school or university
    cohort      TEXT,                         -- e.g. Fall 2026
    year        TEXT,                         -- academic year, e.g. 2026-27
    uploaded_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (type, name)                       -- same name in same section = same file (replace)
  );
`);

module.exports = db;
