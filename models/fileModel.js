// ============================================================
// MODEL - File Management (Brandon)
// The model is the only part of the app that knows WHERE files
// are stored. Everything else asks the model for them.
//   - Everything lives in Postgres, in the "files" table
//     (see db/database.js): the file itself (content column)
//     plus its details (tags, size, upload date).
//   - Files are NOT saved to disk anymore, because Vercel's
//     servers don't allow writing files.
// All functions that touch the database are async: use "await".
// ============================================================

const db = require("../db/database"); // shared Postgres connection

// The survey sections we support.
const TYPES = ["pre", "post", "general"];

// STORY #41: choices for the Program and Academic year dropdowns.
// Add a line here to add a choice; the form updates automatically.
const PROGRAMS = ["My Money Grows", "Collegiate Workshop"];
const YEARS = ["2024-25", "2025-26", "2026-27", "2027-28"];
const SITE_TYPES = require("./scrubber/fields").SITE_TYPES;

// Turns a database row into the object the view uses
const toFile = (row) => ({
  id: row.id,
  expectsPost: row.expects_post !== false, // false = no post-survey planned
  siteType: row.site_type || null,
  status: row.status,                 // new / stored / imported
  rowCount: row.row_count || 0,       // survey rows imported from this file
  waiting: Boolean(row.waiting),      // true = a version is waiting for review
  importedAt: row.imported_at ? new Date(row.imported_at) : null,
  name: row.name,
  size: row.size,
  uploadedAt: new Date(row.uploaded_at),
  program: row.program || "",
  school: row.school || "",
  cohort: row.cohort || "",
  year: row.year || "",
});

// Every column except "content" (the file itself), so lists stay fast
const INFO_COLUMNS =
  "id, type, name, size, program, school, cohort, year, uploaded_at, status, row_count, imported_at, (staging IS NOT NULL) AS waiting, site_type, expects_post";

module.exports = {
  TYPES,
  PROGRAMS,
  YEARS,
  SITE_TYPES,

  // Returns every file in one section, newest first, e.g. await getAll('pre').
  async getAll(type) {
    const rows = await db.all(
      `SELECT ${INFO_COLUMNS} FROM files WHERE type = $1
       ORDER BY uploaded_at DESC, id DESC`,
      [type],
    );
    return rows.map(toFile);
  },

  // Returns one file INCLUDING its contents (a Buffer), or undefined.
  // Use this to download or read a file, e.g. to parse a CSV for reports:
  //   const file = await fileModel.getFile('pre', 'survey.csv');
  //   file.content.toString('utf8')
  async getFile(type, name) {
    const row = await db.get(
      "SELECT * FROM files WHERE type = $1 AND name = $2",
      [type, name],
    );
    return row && { ...toFile(row), content: row.content };
  },

  // STORY #41: saves a just-uploaded file, its details and its tags,
  // and returns its id. Nothing is counted in reports yet: the data
  // scrubber cleans it first and an admin approves it (surveyModel).
  // Same name in the same section = a new version (story #19). The new
  // version waits in pending_content, so the old one keeps working
  // until the new one is approved.
  // detection = how pre/post was decided (see scrubber detectSurveyType)
  async save(type, name, content, tags, userId, detection = null) {
    const cleanTags = {
      program: tags.program || null,
      school: tags.school || null,
      cohort: tags.cohort || null,
      year: tags.year || null,
      site_type: tags.site_type || null,
    };
    const existing = await db.get("SELECT id, status FROM files WHERE type = $1 AND name = $2", [type, name]);
    if (existing && existing.status !== "new") {
      await db.run(
        `UPDATE files SET pending_content = $2, pending_tags = $3, type_detection = $4 WHERE id = $1`,
        [existing.id, content, JSON.stringify(cleanTags), detection && JSON.stringify(detection)],
      );
      return existing.id;
    }
    const row = await db.get(
      `INSERT INTO files (type, name, size, content, program, school, cohort, year, uploaded_at, status, uploaded_by, site_type, type_detection)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $11, $12)
       ON CONFLICT (type, name) DO UPDATE SET
         size = EXCLUDED.size, content = EXCLUDED.content,
         program = EXCLUDED.program, school = EXCLUDED.school,
         cohort = EXCLUDED.cohort, year = EXCLUDED.year,
         uploaded_at = EXCLUDED.uploaded_at, uploaded_by = EXCLUDED.uploaded_by,
         site_type = EXCLUDED.site_type, type_detection = EXCLUDED.type_detection
       RETURNING id`,
      [type, name, content.length, content, cleanTags.program, cleanTags.school, cleanTags.cohort, cleanTags.year, new Date().toISOString(), userId || null, cleanTags.site_type, detection && JSON.stringify(detection)],
    );
    return row.id;
  },

  // Pre-survey files only: is a post-survey planned for these students?
  async setExpectsPost(id, expects) {
    await db.run("UPDATE files SET expects_post = $2 WHERE id = $1 AND type = 'pre'", [id, Boolean(expects)]);
  },

  async getById(id) {
    return db.get(`SELECT ${INFO_COLUMNS} FROM files WHERE id = $1`, [id]).then((r) => r && toFile(r));
  },

  // STORY #17 + #18: delete one file, e.g. await remove('pre', 'survey.csv').
  // Its survey rows are deleted with it (ON DELETE CASCADE), so reports
  // stop counting it right away.
  // Returns:
  //   'deleted'  -> the file is gone, and we checked (#18)
  //   'missing'  -> there was no file with that name to delete
  //   'failed'   -> we tried, but the file is still there
  async remove(type, name) {
    const result = await db.run(
      "DELETE FROM files WHERE type = $1 AND name = $2",
      [type, name],
    );
    if (result.rowCount === 0) return "missing";

    // Story #18: confirm it's really gone before reporting success
    const stillThere = await db.get(
      "SELECT 1 FROM files WHERE type = $1 AND name = $2",
      [type, name],
    );
    return stillThere ? "failed" : "deleted";
  },
};
