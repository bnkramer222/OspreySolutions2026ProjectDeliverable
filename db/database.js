// ============================================================
// DATABASE - shared Postgres connection (whole app)
// Every model that needs the database does:
//   const db = require('../db/database');
// The database is hosted on Neon (connected through Vercel).
// The connection string comes from the DATABASE_URL setting:
//   - on Vercel: set automatically by the Neon integration
//   - locally:   put it in your .env file
//
// Tables are created (or upgraded) automatically when the app starts.
// Everything uses "IF NOT EXISTS", so restarting never wipes data.
//
// TABLES
//   users             -> staff accounts (Account Management)
//   files             -> one row per uploaded survey file + its tags
//                        and its import status (File Management)
//   survey_responses  -> ONE ROW PER STUDENT PER SURVEY, read out of the
//                        files by the data scrubber. Pre and post rows
//                        live in the same table, kept apart by
//                        survey_type ('pre' / 'post').
//   survey_questions  -> every question the system knows about
//                        (key, label, kind: scale / yesno / score / number)
//   scrub_mappings    -> fixes the scrubber has learned and an admin
//                        approved (column names and messy values), so the
//                        same mess is fixed automatically next time
//   ai_usage          -> how many AI (Groq) requests were made each day
//
// VIEWS (read-only "saved queries" used by reports and the dashboard)
//   pre_responses      -> only pre-survey rows
//   post_responses     -> only post-survey rows
//   all_responses      -> pre + post together
//   matched_responses  -> one row per student who took BOTH surveys
//                         (same participant_id, program and cohort)
//
// IMPORTANT: Postgres calls are async. Always use "await":
//   const rows = await db.all("SELECT * FROM files WHERE type = $1", [type]);
// Postgres uses $1, $2, $3... for values.
// ============================================================

const pool = require("./pool");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT   NOT NULL,
    email         TEXT   NOT NULL UNIQUE,     -- stored lowercase
    password_hash TEXT   NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  TEXT;

  CREATE TABLE IF NOT EXISTS files (
    id          SERIAL  PRIMARY KEY,
    type        TEXT    NOT NULL CHECK (type IN ('pre', 'post')), -- which section
    name        TEXT    NOT NULL,             -- file name, e.g. survey.csv
    size        INTEGER NOT NULL DEFAULT 0,   -- in bytes
    content     BYTEA,                        -- the original file (Vercel can't save files to disk)
    program     TEXT,                         -- My Money Grows / Collegiate Workshop
    school      TEXT,                         -- school or university
    cohort      TEXT,                         -- e.g. Fall 2026
    year        TEXT,                         -- academic year, e.g. 2026-27
    uploaded_at TEXT    NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    UNIQUE (type, name)                       -- same name in same section = same file (replace)
  );
  -- Import status, added for the data scrubber:
  --   new      = just uploaded, nothing approved yet
  --   stored   = file saved, rows never read (files uploaded before the scrubber)
  --   imported = rows are in survey_responses
  -- A file is "waiting for review" whenever staging is not empty.
  -- A re-upload waits in pending_content, so the old version keeps working
  -- until the new one is approved.
  ALTER TABLE files ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'stored';
  ALTER TABLE files ADD COLUMN IF NOT EXISTS row_count   INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE files ADD COLUMN IF NOT EXISTS staging     JSONB;       -- scrubber result while in review
  ALTER TABLE files ADD COLUMN IF NOT EXISTS pending_content BYTEA;   -- re-uploaded file waiting for review
  ALTER TABLE files ADD COLUMN IF NOT EXISTS pending_tags    JSONB;
  ALTER TABLE files ADD COLUMN IF NOT EXISTS site_type       TEXT;    -- High school, Seminar / workshop...
  ALTER TABLE files ADD COLUMN IF NOT EXISTS type_detection  JSONB;   -- how pre/post was decided: { source, detail, confirmed }
  ALTER TABLE files ADD COLUMN IF NOT EXISTS scrub_report JSONB;      -- summary kept after import
  ALTER TABLE files ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
  ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

  CREATE TABLE IF NOT EXISTS survey_responses (
    id             SERIAL PRIMARY KEY,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    survey_type    TEXT    NOT NULL CHECK (survey_type IN ('pre', 'post')),
    participant_id TEXT,                      -- student ID (never names)
    program        TEXT,
    school         TEXT,                      -- school or site name
    location       TEXT,                      -- city, state
    grade_level    TEXT,                      -- 6-12 or College
    cohort         TEXT,
    year           TEXT,
    survey_date    DATE,
    answers        JSONB   NOT NULL DEFAULT '{}'::jsonb, -- { question_key: value }
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS site_type TEXT; -- High school, Seminar / workshop...
  CREATE INDEX IF NOT EXISTS survey_responses_type_idx ON survey_responses (survey_type);
  CREATE INDEX IF NOT EXISTS survey_responses_participant_idx ON survey_responses (participant_id);
  CREATE INDEX IF NOT EXISTS survey_responses_school_idx ON survey_responses (school);
  CREATE INDEX IF NOT EXISTS survey_responses_file_idx ON survey_responses (file_id);

  CREATE TABLE IF NOT EXISTS survey_questions (
    key        TEXT PRIMARY KEY,              -- e.g. budgeting_confidence
    label      TEXT NOT NULL,                 -- e.g. Budgeting confidence
    kind       TEXT NOT NULL CHECK (kind IN ('scale', 'yesno', 'score', 'number')),
    max_value  NUMERIC,                       -- 5 for a 1-5 scale, 10 or 100 for scores
    topic      TEXT,                          -- Budgeting, Saving, Credit...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS scrub_mappings (
    id         SERIAL PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('column', 'value')),
    field      TEXT NOT NULL,                 -- 'column' for column names, or the field a value belongs to
    raw        TEXT NOT NULL,                 -- the messy text, lowercased
    canonical  TEXT NOT NULL,                 -- what it should be
    source     TEXT NOT NULL DEFAULT 'admin', -- rule / ai / admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kind, field, raw)
  );

  CREATE TABLE IF NOT EXISTS ai_usage (
    day      DATE PRIMARY KEY,
    requests INTEGER NOT NULL DEFAULT 0,
    tokens   INTEGER NOT NULL DEFAULT 0
  );

  -- Views are rebuilt on every start so new columns show up in them
  DROP VIEW IF EXISTS matched_responses, pre_responses, post_responses, all_responses;

  CREATE VIEW all_responses AS
    SELECT r.*, f.name AS file_name
    FROM survey_responses r JOIN files f ON f.id = r.file_id;

  CREATE VIEW pre_responses  AS SELECT * FROM all_responses WHERE survey_type = 'pre';
  CREATE VIEW post_responses AS SELECT * FROM all_responses WHERE survey_type = 'post';

  -- One row per student who answered both surveys in the same program + cohort.
  -- DISTINCT ON keeps the latest response if a student appears twice.
  CREATE VIEW matched_responses AS
    WITH pre AS (
      SELECT DISTINCT ON (participant_id, coalesce(program,''), coalesce(cohort,''))
             participant_id, program, cohort, school, grade_level, year, answers
      FROM survey_responses
      WHERE survey_type = 'pre' AND participant_id IS NOT NULL
      ORDER BY participant_id, coalesce(program,''), coalesce(cohort,''), id DESC
    ), post AS (
      SELECT DISTINCT ON (participant_id, coalesce(program,''), coalesce(cohort,''))
             participant_id, program, cohort, answers
      FROM survey_responses
      WHERE survey_type = 'post' AND participant_id IS NOT NULL
      ORDER BY participant_id, coalesce(program,''), coalesce(cohort,''), id DESC
    )
    SELECT pre.participant_id, pre.program, pre.cohort, pre.school, pre.grade_level, pre.year,
           pre.answers AS pre_answers, post.answers AS post_answers
    FROM pre JOIN post
      ON post.participant_id = pre.participant_id
     AND coalesce(post.program,'') = coalesce(pre.program,'')
     AND coalesce(post.cohort,'')  = coalesce(pre.cohort,'');
`;

// Runs the schema once per server start. Every query below waits for it.
// A transaction lock stops two Vercel copies from creating the same tables
// at once, and is released automatically at COMMIT (safe with Neon's pooler).
const ready = (async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(472001)");
    await client.query(SCHEMA);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
})();
ready.catch((err) => console.error("Database setup failed:", err));

// ---- Helpers ----

// Any SQL. Returns the full result ({ rows, rowCount }).
async function query(sql, params = []) {
  await ready;
  return pool.query(sql, params);
}

// SELECT that returns many rows -> array
async function all(sql, params = []) {
  return (await query(sql, params)).rows;
}

// SELECT that returns one row -> object (or undefined)
async function get(sql, params = []) {
  return (await query(sql, params)).rows[0];
}

// INSERT / UPDATE / DELETE -> { rowCount, rows }
async function run(sql, params = []) {
  const result = await query(sql, params);
  return { rowCount: result.rowCount, rows: result.rows };
}

// Runs several queries as ONE unit: if any fails, none of them count.
//   await db.transaction(async (tx) => { await tx.query(...); await tx.query(...); });
async function transaction(work) {
  await ready;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, ready, query, all, get, run, transaction };
