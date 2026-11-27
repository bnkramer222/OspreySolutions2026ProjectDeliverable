// ============================================================
// MODEL - Survey data (Brandon)
// Connects the scrubber to the database:
//   prepare()  -> scrub a file and park the result for review
//   approve()  -> write the cleaned rows into survey_responses
//   discard()  -> throw away a pending upload
// plus small read helpers the dashboard and reports use.
// Pre and post rows share the survey_responses table and are kept
// apart by survey_type. See db/database.js for the views.
// ============================================================

const db = require("../db/database");
const scrub = require("./scrubber");
const ai = require("./scrubber/ai");
const F = require("./scrubber/fields");

// What the scrubber should remember: approved fixes + names already in the database
async function loadContext() {
  const [mappings, names] = await Promise.all([
    db.all("SELECT kind, field, raw, canonical FROM scrub_mappings"),
    db.all(`SELECT 'school' AS field, school AS value FROM survey_responses WHERE school IS NOT NULL
            UNION SELECT 'program', program FROM survey_responses WHERE program IS NOT NULL
            UNION SELECT 'cohort', cohort FROM survey_responses WHERE cohort IS NOT NULL
            UNION SELECT 'location', location FROM survey_responses WHERE location IS NOT NULL`),
  ]);
  const memory = { columns: {}, values: {} };
  for (const m of mappings) {
    if (m.kind === "column") memory.columns[m.raw] = m.canonical;
    else memory.values[`${m.field}::${m.raw}`] = m.canonical;
  }
  const known = {};
  for (const { field, value } of names) (known[field] = known[field] || []).push(value);
  return { memory, known };
}

// Scrub a file (new or re-uploaded) and park the result for review.
// file: the files row (needs id, type, content or pendingContent, tags)
async function prepare(fileId, overrides = {}) {
  const file = await db.get("SELECT * FROM files WHERE id = $1", [fileId]);
  if (!file) throw new Error("File not found");
  const content = file.pending_content || file.content;
  const tags = file.pending_tags || { program: file.program, school: file.school, cohort: file.cohort, year: file.year };
  const context = await loadContext();
  // Re-scrubbing after the admin changes a column: reuse the AI answers
  // from the first pass instead of asking again (saves free-tier requests).
  const previous = file.staging && file.staging.result;
  if (previous && overrides.reuseAi !== false) {
    for (const c of previous.columns) if (c.source === "ai") context.memory.columns[F.normalizeHeader(c.header)] = c.field;
    for (const ch of previous.changes) if (ch.source === "ai") context.memory.values[`${ch.fieldKey}::${ch.from.toLowerCase()}`] = ch.to;
  }
  const result = await scrub(content, file.name, {
    sectionType: file.type,
    tags,
    overrides,
    memory: context.memory,
    known: context.known,
    ai: previous && overrides.reuseAi !== false ? null : ai,
  });
  // Keep the "came from AI" labels on a re-scrub so the admin still sees them
  if (previous) {
    const prevCols = Object.fromEntries(previous.columns.map((c) => [c.header, c]));
    result.columns.forEach((c) => c.source === "saved" && prevCols[c.header] && prevCols[c.header].source === "ai" && (c.source = "ai"));
    const prevChanges = Object.fromEntries(previous.changes.map((c) => [c.id, c]));
    result.changes.forEach((c) => c.source === "saved" && prevChanges[c.id] && prevChanges[c.id].source === "ai" && (c.source = "ai"));
    result.ai = previous.ai;
  }
  await db.run("UPDATE files SET staging = $1 WHERE id = $2", [JSON.stringify({ result, overrides }), fileId]);
  return result;
}

// Writes the approved rows. Everything happens in one transaction,
// so a failure never leaves half a file in the database.
async function approve(fileId, userId) {
  const file = await db.get("SELECT id, type, staging, pending_tags, status FROM files WHERE id = $1", [fileId]);
  if (!file || !file.staging) throw new Error("Nothing is waiting for review for this file.");
  const { result, overrides } = file.staging;
  const rows = result.rows.map((r) => ({
    survey_type: r.survey_type,
    participant_id: r.participant_id || null,
    program: r.program || null,
    school: r.school || null,
    location: r.location || null,
    grade_level: r.grade_level || null,
    cohort: r.cohort || null,
    year: r.year || null,
    survey_date: r.survey_date || null,
    answers: r.answers,
  }));

  await db.transaction(async (tx) => {
    // Re-upload: the new version replaces the old version's rows
    await tx.query("DELETE FROM survey_responses WHERE file_id = $1", [fileId]);
    await tx.query(
      `INSERT INTO survey_responses (file_id, survey_type, participant_id, program, school, location, grade_level, cohort, year, survey_date, answers)
       SELECT $1, x.survey_type, x.participant_id, x.program, x.school, x.location, x.grade_level, x.cohort, x.year, x.survey_date, x.answers
       FROM jsonb_to_recordset($2::jsonb) AS x(survey_type text, participant_id text, program text, school text, location text,
            grade_level text, cohort text, year text, survey_date date, answers jsonb)`,
      [fileId, JSON.stringify(rows)],
    );
    for (const q of result.questions)
      await tx.query(
        `INSERT INTO survey_questions (key, label, kind, max_value, topic) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (key) DO NOTHING`,
        [q.key, q.label, q.kind, q.max_value, q.topic],
      );
    // Remember column names and spellings the admin (or AI) settled,
    // so the next file with the same mess is fixed automatically.
    for (const c of result.columns)
      if ((c.source === "ai" || c.source === "admin") && c.field && !["ignore", "pii"].includes(c.field) && !c.field.startsWith("q_"))
        await tx.query(
          `INSERT INTO scrub_mappings (kind, field, raw, canonical, source) VALUES ('column', 'column', $1, $2, $3)
           ON CONFLICT (kind, field, raw) DO UPDATE SET canonical = EXCLUDED.canonical, source = EXCLUDED.source`,
          [F.normalizeHeader(c.header), c.field, c.source],
        );
    const rejected = new Set((overrides && overrides.rejected) || []);
    for (const ch of result.changes)
      if (ch.source === "ai" && !rejected.has(ch.id) && ["school", "program", "cohort", "location"].includes(ch.fieldKey))
        await tx.query(
          `INSERT INTO scrub_mappings (kind, field, raw, canonical, source) VALUES ('value', $1, $2, $3, 'ai')
           ON CONFLICT (kind, field, raw) DO UPDATE SET canonical = EXCLUDED.canonical`,
          [ch.fieldKey, ch.from.toLowerCase(), ch.to],
        );
    const { rows: _rows, ...summary } = result;
    const tags = file.pending_tags;
    await tx.query(
      `UPDATE files SET status = 'imported', row_count = $2, scrub_report = $3, staging = NULL, imported_at = now(),
         size = octet_length(COALESCE(pending_content, content)),
         uploaded_at = CASE WHEN pending_content IS NULL THEN uploaded_at
                            ELSE to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') END,
         content = COALESCE(pending_content, content), pending_content = NULL, pending_tags = NULL,
         program = COALESCE($4, program), school = COALESCE($5, school), cohort = COALESCE($6, cohort), year = COALESCE($7, year),
         uploaded_by = COALESCE($8, uploaded_by)
       WHERE id = $1`,
      [fileId, rows.length, JSON.stringify(summary), tags && tags.program, tags && tags.school, tags && tags.cohort, tags && tags.year, userId || null],
    );
  });
  return rows.length;
}

// Cancels a pending upload. A brand-new file is removed; a re-upload
// is dropped and the previous version stays as it was.
async function discard(fileId) {
  const file = await db.get("SELECT status FROM files WHERE id = $1", [fileId]);
  if (!file) return;
  if (file.status === "new") await db.run("DELETE FROM files WHERE id = $1", [fileId]);
  else await db.run("UPDATE files SET staging = NULL, pending_content = NULL, pending_tags = NULL WHERE id = $1", [fileId]);
}

async function getStaged(fileId) {
  return db.get(
    `SELECT id, type, name, status, program, school, cohort, year, staging, pending_tags,
            (pending_content IS NOT NULL) AS is_replacement
     FROM files WHERE id = $1`,
    [fileId],
  );
}

// ---------- Read helpers for the dashboard ----------

async function overview() {
  return db.get(`
    SELECT
      (SELECT count(*) FROM survey_responses WHERE survey_type = 'pre')::int  AS pre_responses,
      (SELECT count(*) FROM survey_responses WHERE survey_type = 'post')::int AS post_responses,
      (SELECT count(DISTINCT participant_id) FROM survey_responses)::int      AS participants,
      (SELECT count(*) FROM matched_responses)::int                           AS matched,
      (SELECT count(DISTINCT school) FROM survey_responses)::int              AS schools,
      (SELECT count(*) FROM files WHERE staging IS NOT NULL)::int             AS waiting,
      (SELECT count(*) FROM files WHERE status = 'stored' AND staging IS NULL)::int AS not_imported`);
}

async function recentImports(limit = 6) {
  return db.all(
    `SELECT f.id, f.type, f.name, f.school, f.program, f.cohort, f.row_count, f.imported_at, u.name AS uploaded_by
     FROM files f LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.status = 'imported' ORDER BY f.imported_at DESC NULLS LAST LIMIT $1`,
    [limit],
  );
}

async function schools() {
  return db.all(`
    SELECT school, max(location) AS location,
           count(*) FILTER (WHERE survey_type = 'pre')::int  AS pre_count,
           count(*) FILTER (WHERE survey_type = 'post')::int AS post_count,
           array_agg(DISTINCT program) FILTER (WHERE program IS NOT NULL) AS programs
    FROM survey_responses WHERE school IS NOT NULL
    GROUP BY school ORDER BY school`);
}

// Paged list of individual responses for the data browser
async function responses({ type, search, school, page = 1, perPage = 50 }) {
  const where = [];
  const params = [];
  if (type === "pre" || type === "post") where.push(`survey_type = $${params.push(type)}`);
  if (school) where.push(`school = $${params.push(school)}`);
  if (search) {
    params.push(`%${search}%`);
    where.push(`(participant_id ILIKE $${params.length} OR school ILIKE $${params.length} OR program ILIKE $${params.length} OR cohort ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (await db.get(`SELECT count(*)::int AS n FROM all_responses ${clause}`, params)).n;
  const rows = await db.all(
    `SELECT survey_type, participant_id, program, school, location, grade_level, cohort, survey_date, file_name
     FROM all_responses ${clause} ORDER BY id DESC LIMIT ${perPage} OFFSET ${(Math.max(1, page) - 1) * perPage}`,
    params,
  );
  return { total, rows, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / perPage)) };
}

module.exports = { prepare, approve, discard, getStaged, overview, recentImports, schools, responses, aiUsage: ai.usageToday, FIELDS: F.ALL_FIELDS };
