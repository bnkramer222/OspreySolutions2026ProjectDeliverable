// ============================================================
// SCRUBBER - cleans one messy survey file (Brandon)
//
//   const result = await scrub(buffer, "lincoln_pre.xlsx", options);
//
// Steps:
//   1. Read the file into a grid (readTable.js)
//   2. Find the real header row (skips title rows like "Fall 2026 Survey")
//   3. Decide what each column is:
//        admin choice > saved fix > rules > AI suggestion > new question
//      Name / email / phone columns are dropped and never stored.
//   4. Clean every row with the rules in fields.js
//      (Yes/No, 1-5 ratings, scores, grades, dates, IDs, extra spaces)
//      and remove blank rows, repeated header rows and "Total" rows.
//   5. Make school / program / cohort / location spellings consistent
//      (saved fixes, names already in the database, then AI)
//   6. Flag problems: duplicate IDs, missing IDs, values it couldn't read
//
// Nothing is saved here. The result goes to the review screen, and
// rows are only stored after an admin approves (surveyModel.approve).
// ============================================================

const readTable = require("./readTable");
const F = require("./fields");

const MAX_ISSUES = 300; // stored for the review screen; the total is still counted

const str = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim());

// Rows that look like headers: lots of short text cells, ideally known column names
function headerScore(row) {
  let textCells = 0;
  let known = 0;
  for (const cell of row) {
    const v = str(cell);
    if (!v || v.length > 80 || /^-?\d+(\.\d+)?%?$/.test(v) || cell instanceof Date) continue;
    textCells++;
    const m = F.matchHeader(v);
    if (m) known++;
  }
  return textCells >= 2 ? textCells + known * 2 : 0;
}

function findHeaderRow(grid) {
  let best = { index: 0, score: 0 };
  grid.slice(0, 15).forEach((row, index) => {
    const s = headerScore(row || []);
    if (s > best.score) best = { index, score: s };
  });
  return best.index;
}

// options:
//   sectionType  'pre' | 'post' (the section it was uploaded to)
//   tags         { program, school, cohort, year } from the upload form
//   overrides    { columns: { header: fieldKey|'new'|'ignore' }, rejected: [changeId] }
//   memory       { columns: { normalizedHeader: fieldKey }, values: { 'field::raw lowercase': canonical } }
//   known        { school: [...], program: [...], cohort: [...], location: [...] } already in the database
//   ai           the ai.js module, or null to skip AI
async function scrub(buffer, fileName, options = {}) {
  const { sectionType = "pre", tags = {}, overrides = {}, memory = {}, known = {}, ai = null } = options;
  const columnOverrides = overrides.columns || {};
  const rejected = new Set(overrides.rejected || []);
  const memColumns = memory.columns || {};
  const memValues = memory.values || {};

  const { sheetName, grid } = await readTable(buffer, fileName);
  const removed = { titleRows: 0, blankRows: 0, repeatedHeaders: 0, summaryRows: 0, noteRows: 0, duplicateRows: 0, emptyColumns: 0, piiColumns: [], ignoredColumns: [] };
  const issues = [];
  let issueCount = 0;
  const addIssue = (issue) => {
    issueCount++;
    if (issues.length < MAX_ISSUES) issues.push(issue);
  };
  const aiInfo = { used: false, requests: 0, status: "not_needed", message: null };
  const noteAi = (result) => {
    if (result.ok) {
      aiInfo.used = true;
      aiInfo.requests++;
      if (aiInfo.status !== "limit" && aiInfo.status !== "error") aiInfo.status = "ok";
    } else {
      aiInfo.status = result.status;
      aiInfo.message = result.message;
    }
  };

  if (!grid.length || grid.every((r) => !r || r.every((c) => !str(c))))
    throw new Error("The file is empty.");

  // ---------- 2. Header row ----------
  const headerIndex = findHeaderRow(grid);
  removed.titleRows = grid.slice(0, headerIndex).filter((r) => r && r.some((c) => str(c))).length;
  const width = Math.max(...grid.map((r) => (r ? r.length : 0)));
  const body = grid.slice(headerIndex + 1).map((r) => Array.from({ length: width }, (_, i) => (r ? r[i] : "")));

  const seen = {};
  const headers = Array.from({ length: width }, (_, i) => {
    let h = str((grid[headerIndex] || [])[i]).replace(/\s+/g, " ");
    if (!h) h = `Column ${i + 1}`;
    seen[h] = (seen[h] || 0) + 1;
    return seen[h] > 1 ? `${h} (${seen[h]})` : h;
  });

  // ---------- 3. What is each column? ----------
  const columns = headers.map((header, index) => {
    const values = body.map((r) => r[index]).filter((v) => !F.isBlank(v));
    const samples = [...new Set(values.map(str))].slice(0, 4);
    return { index, header, values, samples, field: null, source: null };
  });

  const unknown = [];
  for (const col of columns) {
    if (!col.values.length) {
      col.field = "ignore";
      col.source = "empty";
      removed.emptyColumns++;
      continue;
    }
    const norm = F.normalizeHeader(col.header);
    const rule = F.matchHeader(col.header);
    if (columnOverrides[col.header]) [col.field, col.source] = [columnOverrides[col.header], "admin"];
    else if (memColumns[norm]) [col.field, col.source] = [memColumns[norm], "saved"];
    else if (rule && rule.pii) [col.field, col.source] = ["pii", "rule"];
    else if (rule) [col.field, col.source] = [rule.field, "rule"];
    else if (col.values.filter(F.looksPrivate).length / col.values.length > 0.3) [col.field, col.source] = ["pii", "rule"];
    else unknown.push(col);
  }

  // Ask the AI about headers the rules didn't recognize (one request per file)
  if (unknown.length) {
    const safe = unknown.map((c) => ({
      header: c.header,
      samples: c.samples.filter((s) => s.length <= 30 && !F.looksPrivate(s)).slice(0, 3),
    }));
    const result = ai && ai.available() ? await ai.suggestColumns(safe, F.ALL_FIELDS) : null;
    if (result) noteAi(result);
    else if (ai) noteAi({ ok: false, status: "no_key", message: "No GROQ_API_KEY set, so unknown columns were treated as new questions." });
    for (const col of unknown) {
      const suggestion = result && result.ok ? result.data[col.header] : null;
      if (suggestion) [col.field, col.source] = [suggestion, "ai"];
      else [col.field, col.source] = ["new", "auto"];
    }
  }

  // New questions: detect their kind; free-text columns are not stored
  const questions = {};
  const usedFields = new Set();
  for (const col of columns) {
    if (col.field === "pii") {
      removed.piiColumns.push(col.header);
      continue;
    }
    if (col.field === "ignore") {
      if (col.source !== "empty") removed.ignoredColumns.push(col.header);
      continue;
    }
    if (col.field && col.field.startsWith("q_")) col.field = "new"; // a question found on an earlier pass
    if (col.field === "new") {
      const kind = F.detectKind(col.values);
      if (!kind) {
        col.field = "ignore";
        col.note = "Free-text answers aren't counted in reports";
        removed.ignoredColumns.push(col.header);
        continue;
      }
      col.field = `q_${F.slug(col.header)}`;
      col.kind = kind;
      col.label = col.header.replace(/^(q|question)\s*\d+[.):]?\s*/i, "").slice(0, 80);
    } else {
      const def = F.fieldByKey(col.field);
      if (!def) {
        col.field = "ignore";
        removed.ignoredColumns.push(col.header);
        continue;
      }
      col.kind = def.kind || "info";
      col.label = def.label;
    }
    if (usedFields.has(col.field)) {
      addIssue({ row: null, field: col.header, value: "", problem: `Another column is already "${col.label}", so this one was skipped.`, severity: "warning" });
      col.duplicateOf = col.field;
      col.field = "ignore";
      removed.ignoredColumns.push(col.header);
      continue;
    }
    usedFields.add(col.field);
    if (col.kind !== "info") {
      const def = F.fieldByKey(col.field) || {};
      let max = def.max || (col.kind === "scale" ? 5 : null);
      if (col.kind === "score") {
        // Plain numbers (no "/" or "%"): a max of 10 or less means a 10-point quiz
        const plain = col.values.filter((v) => !/%|\/|out of/i.test(String(v))).map((v) => parseFloat(v)).filter(Number.isFinite);
        col.outOf = plain.length && Math.max(...plain) <= 10 ? 10 : 100;
        max = 100;
      }
      questions[col.field] = { key: col.field, label: col.label, kind: col.kind, max_value: max, topic: def.topic || null };
    }
  }

  // ---------- 4. Clean the rows ----------
  const changes = new Map(); // "field::from" -> { field, from, to, count, source }
  const noteChange = (fieldKey, field, from, to, source) => {
    const id = `${field}::${from}`;
    const c = changes.get(id) || { id, fieldKey, field, from, to, count: 0, source };
    c.count++;
    changes.set(id, c);
  };
  const active = columns.filter((c) => c.field !== "ignore" && c.field !== "pii");
  const headerSet = new Set(headers.map((h) => h.toLowerCase()));
  const rows = [];

  body.forEach((cells, i) => {
    const rowNumber = headerIndex + i + 2; // the row number the admin sees in Excel
    const filled = cells.filter((c) => !F.isBlank(c));
    if (!filled.length) return removed.blankRows++;
    if (filled.filter((c) => headerSet.has(str(c).toLowerCase())).length >= Math.max(2, filled.length / 2)) return removed.repeatedHeaders++;
    if (/^(total|totals|average|avg|mean|sum|count|overall)\b/i.test(str(filled[0])) && filled.length <= active.length) return removed.summaryRows++;
    if (filled.length === 1 && width > 3 && str(filled[0]).length > 25) return removed.noteRows++;

    const record = { rowNumber, survey_type: sectionType, answers: {} };
    for (const col of active) {
      const raw = cells[col.index];
      if (F.isBlank(raw)) continue;
      const clean = F.cleanerFor(col.field, col.kind);
      const result =
        col.kind === "scale" ? clean(raw, questions[col.field].max_value || 5)
        : col.kind === "score" ? clean(raw, col.outOf)
        : col.field === "grade_level" ? clean(raw, record.program || tags.program)
        : clean(raw);
      if (result.problem) {
        addIssue({ row: rowNumber, field: col.label, value: str(raw), problem: `${result.problem}. Left blank.`, severity: "warning" });
        continue;
      }
      if (result.value === null) continue;
      const before = str(raw);
      if (String(result.value) !== before && col.kind !== "score" && !["participant_id", "survey_type"].includes(col.field))
        noteChange(col.field, col.label, before, String(result.value), "rule");
      if (col.kind === "info") record[col.field] = result.value;
      else record.answers[col.field] = result.value;
    }
    // Upload-form tags fill in anything the file doesn't say
    for (const key of ["program", "school", "cohort", "year", "site_type"]) if (!record[key] && tags[key]) record[key] = tags[key];
    if (!record.participant_id && !Object.keys(record.answers).length) return removed.blankRows++;
    rows.push(record);
  });

  // ---------- 5. Consistent names (school, program, cohort, location) ----------
  for (const field of ["school", "program", "cohort", "location"]) {
    const label = F.fieldByKey(field).label;
    const counts = {};
    rows.forEach((r) => r[field] && (counts[r[field]] = (counts[r[field]] || 0) + 1));
    const values = Object.keys(counts);
    if (!values.length) continue;

    const knownList = [...new Set([...(known[field] || []), ...(tags[field] ? [tags[field]] : []), ...(field === "program" ? F.PROGRAMS : [])])];
    const knownByKey = Object.fromEntries(knownList.map((k) => [F.nameKey(k), k]));
    const fix = {}; // value -> { to, source }

    // Same name with different spacing/case/abbreviation: use the known or most common spelling
    const groups = {};
    values.forEach((v) => (groups[F.nameKey(v)] = groups[F.nameKey(v)] || []).push(v));
    for (const [key, variants] of Object.entries(groups)) {
      const target = knownByKey[key] || variants.sort((a, b) => counts[b] - counts[a])[0];
      variants.forEach((v) => v !== target && (fix[v] = { to: target, source: "rule" }));
    }
    // Fixes an admin approved before
    values.forEach((v) => {
      const saved = memValues[`${field}::${v.toLowerCase()}`];
      if (saved && saved !== v) fix[v] = { to: saved, source: "saved" };
    });
    // Still-unfamiliar names: ask the AI once for this field
    const settled = (v) => knownList.includes(fix[v] ? fix[v].to : v);
    const unsettled = values.filter((v) => !settled(v));
    if (ai && ai.available() && unsettled.length && (values.length > 1 || knownList.length)) {
      const result = await ai.suggestValues(field, values.filter((v) => !fix[v] || fix[v].source !== "saved"), knownList.slice(0, 80));
      noteAi(result);
      if (result.ok) for (const [from, to] of Object.entries(result.data)) if (!fix[from]) fix[from] = { to, source: "ai" };
    }
    // Apply, unless the admin rejected that change
    for (const [from, { to, source }] of Object.entries(fix)) {
      const id = `${label}::${from}`;
      if (rejected.has(id)) continue;
      let n = 0;
      rows.forEach((r) => r[field] === from && ((r[field] = to), n++));
      const c = changes.get(id) || { id, fieldKey: field, field: label, from, to, count: 0, source };
      Object.assign(c, { to, source: source === "rule" && c.source === "rule" ? "rule" : source, count: Math.max(c.count, n) });
      changes.set(id, c);
    }
  }

  // Site type: the file's own column, else the upload form, else guessed from the name
  for (const r of rows) if (!r.site_type) r.site_type = F.inferSiteType(r.school) || null;

  // ---------- 6. Problems ----------
  const seenIds = new Map();
  const kept = [];
  const noId = [];
  for (const r of rows) {
    if (!r.participant_id) {
      noId.push(r.rowNumber);
      kept.push(r);
      continue;
    }
    const key = [r.survey_type, r.participant_id, r.program || "", r.cohort || ""].join("|");
    if (seenIds.has(key)) {
      removed.duplicateRows++;
      addIssue({ row: r.rowNumber, field: "Participant ID", value: r.participant_id, problem: `Duplicate of row ${seenIds.get(key)}. Only the first one is kept.`, severity: "error" });
      continue;
    }
    seenIds.set(key, r.rowNumber);
    kept.push(r);
  }
  if (noId.length)
    addIssue({
      row: noId.length === 1 ? noId[0] : null,
      field: "Participant ID",
      value: "",
      problem: `${noId.length === rows.length ? "No rows have" : `${noId.length} row${noId.length > 1 ? "s have" : " has"}`} a student ID${noId.length > 1 && noId.length < rows.length ? ` (rows ${noId.slice(0, 8).join(", ")}${noId.length > 8 ? "…" : ""})` : ""}, so ${noId.length > 1 ? "they" : "it"} can't be matched to the other survey. Kept for totals.`,
      severity: "warning",
    });
  if (!kept.length) throw new Error("No survey answers were found in this file.");

  const mappedTypes = new Set(kept.map((r) => r.survey_type));
  return {
    fileName,
    sheetName,
    headerRow: headerIndex + 1,
    columns: columns.map(({ index, header, samples, field, source, kind, label, note }) => ({ index, header, samples, field, source, kind: kind || null, label: label || null, note: note || null })),
    questions: Object.values(questions),
    rows: kept,
    changes: [...changes.values()].sort((a, b) => b.count - a.count),
    issues,
    issueCount,
    removed,
    stats: {
      rowsRead: body.filter((r) => r.some((c) => !F.isBlank(c))).length,
      rowsReady: kept.length,
      withId: kept.filter((r) => r.participant_id).length,
      surveyTypes: [...mappedTypes],
    },
    ai: aiInfo,
  };
}

// ---------- Pre or post? ----------
// Looks for clues in this order, stopping at the first one:
//   1. a Pre/Post column (each row says which it is)
//   2. the file name ("lincoln_PRE_fall.xlsx")
//   3. the sheet name ("Post Survey Responses")
//   4. title rows above the headers ("My Money Grows Pre-Survey")
//   5. the AI (file name, sheet, titles and headers only)
// Returns { type: 'pre'|'post'|null, source, detail }
async function detectSurveyType(buffer, fileName, ai = null) {
  const { sheetName, grid } = await readTable(buffer, fileName);
  const headerIndex = findHeaderRow(grid);
  const headers = (grid[headerIndex] || []).map(str).filter(Boolean);
  if (headers.some((h) => (F.matchHeader(h) || {}).field === "survey_type"))
    return { type: null, source: "column", detail: "Each row has its own Pre/Post column." };
  const fromName = F.surveyTypeFromText(fileName.replace(/\.[a-z]+$/i, ""));
  if (fromName) return { type: fromName, source: "file name", detail: `The file name "${fileName}" says ${fromName}.` };
  const fromSheet = F.surveyTypeFromText(sheetName);
  if (fromSheet) return { type: fromSheet, source: "sheet name", detail: `The sheet is called "${sheetName}".` };
  const titles = grid.slice(0, headerIndex).map((r) => (r || []).map(str).filter(Boolean).join(" ")).filter(Boolean);
  const fromTitle = F.surveyTypeFromText(titles.join(" "));
  if (fromTitle) return { type: fromTitle, source: "title", detail: `The title row says "${titles.join(" ").slice(0, 80)}".` };
  if (ai && ai.available()) {
    const result = await ai.suggestSurveyType({ fileName, sheetName, titleRows: titles.slice(0, 3), headers: headers.slice(0, 40) });
    if (result.ok && result.data.type)
      return { type: result.data.type, source: "AI", detail: result.data.reason || "Suggested by AI from the column headers." };
  }
  return { type: null, source: "unknown", detail: "Nothing in the file says whether it's a pre- or post-survey." };
}

module.exports = scrub;
module.exports.detectSurveyType = detectSurveyType;
