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
const TYPES = ["pre", "post"];

// STORY #41: choices for the Program and Academic year dropdowns.
// Add a line here to add a choice; the form updates automatically.
const PROGRAMS = ["My Money Grows", "Collegiate Workshop"];
const YEARS = ["2024-25", "2025-26", "2026-27", "2027-28"];

// Turns a database row into the object the view uses
const toFile = (row) => ({
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
  "id, type, name, size, program, school, cohort, year, uploaded_at";

module.exports = {
  TYPES,
  PROGRAMS,
  YEARS,

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

  // STORY #41: saves a just-uploaded file, its details and its tags.
  // "content" is the file itself (req.file.buffer from multer).
  // If a file with the same name is already in this section, it is
  // replaced (story #19).
  async save(type, name, content, tags) {
    await db.run(
      `INSERT INTO files (type, name, size, content, program, school, cohort, year, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (type, name) DO UPDATE SET
         size = EXCLUDED.size, content = EXCLUDED.content,
         program = EXCLUDED.program, school = EXCLUDED.school,
         cohort = EXCLUDED.cohort, year = EXCLUDED.year,
         uploaded_at = EXCLUDED.uploaded_at`,
      [
        type,
        name,
        content.length,
        content,
        tags.program || null,
        tags.school || null,
        tags.cohort || null,
        tags.year || null,
        new Date().toISOString(),
      ],
    );
  },

  // STORY #17 + #18: delete one file, e.g. await remove('pre', 'survey.csv').
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
