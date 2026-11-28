// ============================================================
// REPORTS - loads and summarizes survey data (Joshua)
// Every report module gets the same "data" object from load():
//   data.pre, data.post   -> response rows matching the filters
//   data.pairs            -> students who took BOTH surveys
//                            { id, school, program, ..., pre: answers, post: answers }
//   data.questions        -> question catalog (key, label, kind, max_value, topic)
// plus helper functions so modules stay short.
// Reports are aggregated: they show totals, averages and percentages,
// never one student's answers.
// ============================================================

const db = require("../../db/database");

// Filters the report builder offers. "column" is the survey_responses column.
const FILTERS = [
  { key: "program", label: "Program", column: "program" },
  { key: "school", label: "School / university", column: "school" },
  { key: "cohort", label: "Cohort", column: "cohort" },
  { key: "year", label: "Academic year", column: "year" },
  { key: "grade", label: "Grade level", column: "grade_level" },
];

// Values to offer in each filter dropdown
async function filterOptions() {
  const out = {};
  for (const f of FILTERS) {
    const rows = await db.all(
      `SELECT DISTINCT ${f.column} AS v FROM survey_responses WHERE ${f.column} IS NOT NULL ORDER BY 1`,
    );
    out[f.key] = rows.map((r) => r.v);
  }
  if (out.grade) out.grade.sort((a, b) => (Number(a) || 99) - (Number(b) || 99));
  return out;
}

async function load(filters = {}) {
  const where = [];
  const params = [];
  for (const f of FILTERS) {
    const val = filters[f.key];
    if (val) where.push(`${f.column} = $${params.push(val)}`);
  }
  if (filters.from) where.push(`survey_date >= $${params.push(filters.from)}`);
  if (filters.to) where.push(`survey_date <= $${params.push(filters.to)}`);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows, questions] = await Promise.all([
    db.all(
      `SELECT id, survey_type, participant_id, program, school, location, grade_level, cohort, year, survey_date, answers
       FROM survey_responses ${clause} ORDER BY id`,
      params,
    ),
    db.all("SELECT key, label, kind, max_value::float AS max_value, topic FROM survey_questions ORDER BY created_at, key"),
  ]);

  const pre = rows.filter((r) => r.survey_type === "pre");
  const post = rows.filter((r) => r.survey_type === "post");

  // Match students: same ID, program and cohort (latest response wins)
  const key = (r) => [r.participant_id, r.program || "", r.cohort || ""].join("|");
  const postBy = new Map();
  post.forEach((r) => r.participant_id && postBy.set(key(r), r));
  const preBy = new Map();
  pre.forEach((r) => r.participant_id && preBy.set(key(r), r));
  const pairs = [];
  for (const [k, p] of preBy) {
    const q = postBy.get(k);
    if (q) pairs.push({ id: p.participant_id, school: p.school, program: p.program, cohort: p.cohort, year: p.year, grade_level: p.grade_level, pre: p.answers, post: q.answers });
  }

  // Only questions that appear in the filtered data
  const present = new Set(rows.flatMap((r) => Object.keys(r.answers)));
  return { pre, post, pairs, questions: questions.filter((q) => present.has(q.key)), filters };
}

// ---------- helpers for modules ----------
const nums = (rows, k) => rows.map((a) => a[k]).filter((v) => typeof v === "number");
const avg = (list) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : null);
const pctYes = (rows, k) => {
  const vals = rows.map((a) => a[k]).filter((v) => v === "Yes" || v === "No");
  return vals.length ? (vals.filter((v) => v === "Yes").length / vals.length) * 100 : null;
};

// Unique students in a set of rows (rows without an ID count once each)
const students = (rows) => new Set(rows.map((r) => r.participant_id || `row-${r.id}`)).size;

// Pre vs post for one question.
// matchedOnly = compare only students who took both surveys (fairer).
function compare(data, q, matchedOnly) {
  const preA = matchedOnly ? data.pairs.map((p) => p.pre) : data.pre.map((r) => r.answers);
  const postA = matchedOnly ? data.pairs.map((p) => p.post) : data.post.map((r) => r.answers);
  if (q.kind === "yesno") {
    const a = pctYes(preA, q.key);
    const b = pctYes(postA, q.key);
    return { pre: a, post: b, change: a !== null && b !== null ? b - a : null, n: Math.min(preA.filter((x) => x[q.key]).length, postA.filter((x) => x[q.key]).length) };
  }
  const a = avg(nums(preA, q.key));
  const b = avg(nums(postA, q.key));
  return {
    pre: a,
    post: b,
    change: a !== null && b !== null ? b - a : null,
    pctChange: a ? ((b - a) / a) * 100 : null,
    n: Math.min(nums(preA, q.key).length, nums(postA, q.key).length),
  };
}

// For matched students: how many improved / stayed / declined on a question
function growth(pairs, q) {
  let up = 0, same = 0, down = 0;
  for (const p of pairs) {
    const a = p.pre[q.key];
    const b = p.post[q.key];
    if (q.kind === "yesno") {
      if (!["Yes", "No"].includes(a) || !["Yes", "No"].includes(b)) continue;
      if (a === "No" && b === "Yes") up++;
      else if (a === "Yes" && b === "No") down++;
      else same++;
    } else {
      if (typeof a !== "number" || typeof b !== "number") continue;
      if (b > a) up++;
      else if (b < a) down++;
      else same++;
    }
  }
  const n = up + same + down;
  return { up, same, down, n, upPct: n ? (up / n) * 100 : null };
}

// Formatting used by every module
const fmt = {
  num: (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d).replace(/\.0+$/, "")),
  int: (v) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("en-US")),
  pct: (v) => (v === null || v === undefined ? "—" : `${Math.round(v)}%`),
  signed: (v, d = 1, unit = "") => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d).replace(/\.0+$/, "")}${unit}`),
  // A question's value in its own unit: 3.4 / 5, 72%, 64% yes
  value: (q, v) => (v === null || v === undefined ? "—" : q.kind === "scale" ? `${Number(v).toFixed(1)}` : `${Math.round(v)}%`),
  unit: (q) => (q.kind === "scale" ? ` / ${q.max_value || 5}` : q.kind === "yesno" ? " said yes" : ""),
};

module.exports = { FILTERS, filterOptions, load, compare, growth, students, avg, nums, pctYes, fmt };
