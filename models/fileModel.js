// ============================================================
// MODEL - File Management (Brandon)
// The model is the only part of the app that knows WHERE files
// are stored. Everything else asks the model for them.
//   - The files themselves live in folders on disk:
//       uploads/pre   -> pre-survey files
//       uploads/post  -> post-survey files
//   - Their details (tags, size, upload date) live in the SQLite
//     database, in the "files" table (see db/database.js).
// ============================================================

const fs = require("fs"); // Node's built-in file tools (read folders, check files, delete files)
const path = require("path"); // Builds file paths that work on Windows, Mac and Linux
const db = require("../db/database"); // shared SQLite connection

// Folder where all uploads go: <project>/uploads
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// The survey sections we support. Each one gets its own folder.
const TYPES = ["pre", "post"];

// STORY #41: choices for the Program and Academic year dropdowns.
// Add a line here to add a choice; the form updates automatically.
const PROGRAMS = ["My Money Grows", "Collegiate Workshop"];
const YEARS = ["2024-25", "2025-26", "2026-27", "2027-28"];

// Create uploads/pre and uploads/post if they don't exist yet.
TYPES.forEach((type) =>
  fs.mkdirSync(path.join(UPLOAD_DIR, type), { recursive: true }),
);

// Returns the full path to one file, e.g. getPath('pre', 'survey.csv').
// path.basename() strips out anything like "../" so nobody can
// reach files outside the uploads folder.
function getPath(type, name) {
  return path.join(UPLOAD_DIR, type, path.basename(name));
}

// ---- Prepared SQL statements ----
// "?" and "@name" are placeholders. better-sqlite3 fills them in safely,
// so a file name can never break or change the SQL (no SQL injection).
const sql = {
  list: db.prepare(
    "SELECT * FROM files WHERE type = ? ORDER BY uploaded_at DESC, id DESC",
  ),
  find: db.prepare("SELECT * FROM files WHERE type = ? AND name = ?"),
  // Insert, or if this type+name already exists, update it (story #19: replace a file)
  save: db.prepare(`
    INSERT INTO files (type, name, size, program, school, cohort, year, uploaded_at)
    VALUES (@type, @name, @size, @program, @school, @cohort, @year, @uploadedAt)
    ON CONFLICT (type, name) DO UPDATE SET
      size = excluded.size, program = excluded.program, school = excluded.school,
      cohort = excluded.cohort, year = excluded.year, uploaded_at = excluded.uploaded_at
  `),
  remove: db.prepare("DELETE FROM files WHERE type = ? AND name = ?"),
};

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

// One-time catch-up: files that were uploaded BEFORE the database existed
// get a row with empty tags, so they still show up in the list.
TYPES.forEach((type) => {
  fs.readdirSync(path.join(UPLOAD_DIR, type))
    .filter((name) => !name.startsWith(".")) // skip hidden files like .DS_Store
    .forEach((name) => {
      if (sql.find.get(type, name)) return; // already in the database
      const stats = fs.statSync(getPath(type, name));
      sql.save.run({
        type,
        name,
        size: stats.size,
        program: null,
        school: null,
        cohort: null,
        year: null,
        uploadedAt: stats.mtime.toISOString(),
      });
    });
});

module.exports = {
  TYPES,
  UPLOAD_DIR,
  PROGRAMS,
  YEARS,
  getPath,

  // Returns every file in one section, newest first, e.g. getAll('pre').
  getAll(type) {
    return sql.list.all(type).map(toFile);
  },

  // STORY #41: saves a just-uploaded file's details and tags.
  // If a file with the same name is already in this section, its row is
  // updated instead (the upload replaced the old file on disk).
  save(type, name, size, tags) {
    sql.save.run({
      type,
      name,
      size,
      program: tags.program,
      school: tags.school,
      cohort: tags.cohort || null,
      year: tags.year || null,
      uploadedAt: new Date().toISOString(),
    });
  },

  // STORY #17 + #18: delete one file, e.g. remove('pre', 'survey.csv').
  // Returns:
  //   'deleted'  -> the file and its database row are gone, and we checked (#18)
  //   'missing'  -> there was no file with that name to delete
  //   'failed'   -> we tried, but the file is still there
  remove(type, name) {
    const filePath = getPath(type, name);
    const inDb = !!sql.find.get(type, name);
    if (!fs.existsSync(filePath) && !inDb) return "missing";

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // delete the file from disk
    sql.remove.run(type, name); // delete its row from the database

    // Story #18: confirm it's gone from BOTH places before reporting success
    const gone = !fs.existsSync(filePath) && !sql.find.get(type, name);
    return gone ? "deleted" : "failed";
  },
};
