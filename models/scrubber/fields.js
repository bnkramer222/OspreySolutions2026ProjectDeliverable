// ============================================================
// SCRUBBER - field definitions and cleaning rules (Brandon)
// Everything the scrubber knows about the data:
//   INFO_FIELDS  -> columns that describe the student/session
//   QUESTIONS    -> the standard survey questions
//   PII          -> columns that must never be stored (names, emails...)
// plus small functions that clean one value at a time.
// To teach the scrubber a new column name, add a word to "match".
// ============================================================

const PROGRAMS = ["My Money Grows", "Collegiate Workshop"];

// Where a session happened. Not every session is at a school: seminars,
// community groups and workplaces are sites too.
const SITE_TYPES = ["High school", "Middle school", "University / college", "Seminar / workshop", "Community organization", "Workplace", "Other"];

// Guess the site type from a site's name ("Lincoln HS" -> High school)
function inferSiteType(name) {
  const v = String(name || "").toLowerCase();
  if (/seminar|workshop|webinar|conference|summit|bootcamp|boot camp|clinic/.test(v)) return "Seminar / workshop";
  if (/middle school|\bms\b|junior high|jr\.? high/.test(v)) return "Middle school";
  if (/high school|\bhs\b|\bh\.s\.|secondary|academy|prep\b/.test(v)) return "High school";
  if (/universit|college|\buniv\b|community college|\bhbcu\b/.test(v)) return "University / college";
  if (/ymca|boys (and|&) girls|church|library|community|center|centre|foundation|nonprofit|club\b/.test(v)) return "Community organization";
  if (/bank|credit union|inc\b|llc|corp|company|financial/.test(v)) return "Workplace";
  return null;
}

// Lowercase, no punctuation, single spaces: "Q1. Budget  Conf.?" -> "q1 budget conf"
const normalizeHeader = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[_\-./\\:;?!()[\]{}#*%$"'’]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "Budgeting confidence (1-5)" -> "budgeting_confidence_1_5"
const slug = (text) =>
  normalizeHeader(text)
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "question";

// Columns that describe who/where/when. Checked in this order.
const INFO_FIELDS = [
  { key: "survey_type", label: "Pre / Post", match: [/^(pre ?(or|and)? ?post|survey type|timepoint|phase|pre post)$/] },
  { key: "participant_id", label: "Participant ID", match: [/^(student|participant|learner|user|respondent)? ?(id|number|no|num|code)$/, /^(student|participant|learner|respondent)$/, /^id$/, /\bstudent id\b/, /\bparticipant id\b/] },
  { key: "survey_date", label: "Survey date", match: [/\bdate\b/, /timestamp/, /submitted/, /completed at/] },
  { key: "program", label: "Program", match: [/^program( name)?$/, /^workshop$/, /^course$/] },
  { key: "school", label: "School / site", match: [/\bschool\b(?! year| type)/, /universit/, /\bcollege name\b/, /institution/, /campus/, /^(site|venue|organization|organisation|host|host site|partner)( name)?$/] },
  { key: "site_type", label: "Site type", match: [/^(site|school|venue|organization|setting) type$/, /^setting$/] },
  { key: "location", label: "Location", match: [/^(location|city|state|city state|region|county)$/] },
  { key: "grade_level", label: "Grade level", match: [/\bgrade\b/, /^class(ification)?$/, /year in school/, /^level$/] },
  { key: "cohort", label: "Cohort", match: [/cohort/, /^(term|semester|session)$/] },
  { key: "year", label: "Academic year", match: [/academic year/, /school year/, /^year$/] },
];

// The standard questions. kind: scale (1-5), yesno, score (stored as %), number
const QUESTIONS = [
  { key: "has_budget", label: "Has a budget", kind: "yesno", topic: "Budgeting", match: [/(have|has|use|keep|follow|make)s? (a |your )?(monthly |weekly )?budget\b(?! conf)/, /^has budget$/] },
  { key: "has_savings_account", label: "Has a savings account", kind: "yesno", topic: "Saving", match: [/savings? account/] },
  { key: "has_savings_goal", label: "Has a savings goal", kind: "yesno", topic: "Saving", match: [/sav(ings?|e)? goal/] },
  { key: "has_checking_account", label: "Has a checking account", kind: "yesno", topic: "Banking", match: [/checking acc(oun)?t|checking acct/] },
  { key: "budgeting_confidence", label: "Budgeting confidence", kind: "scale", max: 5, topic: "Budgeting", match: [/budget/] },
  { key: "saving_confidence", label: "Saving confidence", kind: "scale", max: 5, topic: "Saving", match: [/\bsav(e|ing|ings)\b/] },
  { key: "credit_knowledge", label: "Credit knowledge", kind: "scale", max: 5, topic: "Credit", match: [/credit/] },
  { key: "banking_comfort", label: "Banking comfort", kind: "scale", max: 5, topic: "Banking", match: [/bank/] },
  { key: "investing_knowledge", label: "Investing knowledge", kind: "scale", max: 5, topic: "Investing", match: [/invest/] },
  { key: "quiz_score", label: "Quiz score (%)", kind: "score", max: 100, topic: "Knowledge", match: [/quiz/, /test score/, /^score$/, /knowledge check/, /assessment/, /total score/] },
];

// Columns that are personal information. They are dropped and never
// stored or sent to the AI. (Checked AFTER the info fields, so
// "School name" is still read as the school.)
const PII = [
  /^(student |participant |first |last |full |given |family |sur)?name$/,
  /^(first|last|full|given|family) ?name/,
  /e ?mail/, /phone|mobile|cell/, /address|street|zip|postal/,
  /birth|dob|\bage\b/, /ssn|social security/, /parent|guardian/, /signature/,
];

const ALL_FIELDS = [...INFO_FIELDS, ...QUESTIONS];
const fieldByKey = (key) => ALL_FIELDS.find((f) => f.key === key);

// Which field a header belongs to, using the rules above.
// Returns { field } / { pii: true } / null when unknown.
function matchHeader(header) {
  const h = normalizeHeader(header).replace(/^(q|question) ?\d+ /, ""); // "Q3 Credit" -> "credit"
  if (!h) return null;
  for (const f of INFO_FIELDS) if (f.match.some((re) => re.test(h))) return { field: f.key };
  if (PII.some((re) => re.test(h))) return { pii: true };
  for (const q of QUESTIONS) if (q.match.some((re) => re.test(h))) return { field: q.key };
  return null;
}

// ---------- Value cleaners ----------
// Each returns { value } when it understood the value, or { problem } when
// it didn't. "value: null" means the cell is blank.

const BLANKS = new Set(["", "n/a", "na", "-", "--", "none", "null", "nil", "?", "blank", "no response", "skipped", "#n/a"]);
const isBlank = (v) => v === null || v === undefined || BLANKS.has(String(v).trim().toLowerCase());
const text = (v) => String(v).replace(/\s+/g, " ").trim();

const YES = /^(y|yes|yeah|yep|true|t|1|x|✓|✔|checked|i do|i have|have one|definitely|sure)\b/;
const NO = /^(n|no|nope|false|f|0|not yet|i don ?t|don ?t|i do not|do not|never|none)\b/;

function yesno(raw) {
  const v = text(raw).toLowerCase().replace(/[!.]+$/, "");
  if (NO.test(v)) return { value: "No" };
  if (YES.test(v)) return { value: "Yes" };
  return { problem: `"${text(raw)}" isn't a Yes/No answer` };
}

// Words people use instead of 1-5 numbers
const SCALE_WORDS = [
  [/strongly disagree|not at all|no confidence|very low|very poor|none at all/, 1],
  [/strongly agree|extremely|completely|very high|excellent|totally/, 5],
  [/disagree|slightly|a little|low|poor|not very/, 2],
  [/neutral|neither|unsure|not sure|somewhat|moderately|average|okay|ok|fair|maybe/, 3],
  [/agree|very confident|confident|high|good|mostly|quite/, 4],
];

function scale(raw, max = 5) {
  const v = text(raw).toLowerCase();
  const num = v.match(/^(\d+(\.\d+)?)/); // "4", "4 - Agree", "4/5", "4.0"
  if (num) {
    let n = Number(num[1]);
    const outOf = v.match(/^\d+(\.\d+)?\s*(\/|out of)\s*(\d+)/);
    if (outOf && Number(outOf[3]) !== max) n = Math.round((n / Number(outOf[3])) * max * 10) / 10; // 8/10 -> 4
    if (n >= 1 && n <= max) return { value: n };
    if (n === 0) return { problem: `0 is below the 1–${max} scale` };
    return { problem: `${num[1]} is outside the 1–${max} scale` };
  }
  for (const [re, n] of SCALE_WORDS) if (re.test(v)) return { value: n };
  return { problem: `"${text(raw)}" isn't a 1–${max} rating` };
}

// Scores are stored as a percent (0-100) so different quizzes compare.
// "8/10" -> 80, "80%" -> 80, "8" (on a 10-point quiz) -> 80
function score(raw, outOf) {
  const v = text(raw).toLowerCase();
  const frac = v.match(/^(\d+(\.\d+)?)\s*(\/|out of)\s*(\d+(\.\d+)?)/);
  if (frac) {
    const pct = (Number(frac[1]) / Number(frac[4])) * 100;
    return pct >= 0 && pct <= 100 ? { value: Math.round(pct * 10) / 10 } : { problem: `"${text(raw)}" is more than 100%` };
  }
  const num = v.match(/^(\d+(\.\d+)?)\s*%?/);
  if (!num) return { problem: `"${text(raw)}" isn't a score` };
  const n = Number(num[1]);
  const pct = v.includes("%") ? n : (n / outOf) * 100;
  if (pct < 0 || pct > 100) return { problem: `${num[1]} is above the maximum score` };
  return { value: Math.round(pct * 10) / 10 };
}

function number(raw) {
  const n = Number(text(raw).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? { value: n } : { problem: `"${text(raw)}" isn't a number` };
}

const GRADE_WORDS = { freshman: "9", sophomore: "10", junior: "11", senior: "12" };
function grade(raw, program) {
  const v = text(raw).toLowerCase();
  if (/colleg|univ|undergrad|grad student|post ?secondary/.test(v)) return { value: "College" };
  const n = v.match(/(\d{1,2})/);
  if (n && Number(n[1]) >= 1 && Number(n[1]) <= 12 && !/colleg/.test(v)) return { value: String(Number(n[1])) };
  for (const [word, g] of Object.entries(GRADE_WORDS))
    if (v.includes(word)) return { value: program === "Collegiate Workshop" ? "College" : g };
  return { problem: `"${text(raw)}" isn't a grade level` };
}

// Dates: real Excel dates, Excel serial numbers (45567), 9/8/2026, 2026-09-08, Sept 8 2026
function date(raw) {
  let d = null;
  if (raw instanceof Date) d = raw;
  else if (typeof raw === "number" || /^\d{5}(\.\d+)?$/.test(String(raw).trim())) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  } else {
    const v = text(raw);
    const us = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (us) {
      const y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
      d = new Date(Date.UTC(y, Number(us[1]) - 1, Number(us[2])));
    } else {
      const parsed = Date.parse(v);
      if (!Number.isNaN(parsed)) d = new Date(parsed);
    }
  }
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100)
    return { problem: `"${text(String(raw))}" isn't a date` };
  return { value: d.toISOString().slice(0, 10) };
}

function participantId(raw) {
  let v = text(raw).toUpperCase().replace(/^#/, "").replace(/\s+/g, "");
  if (/^\d+\.0+$/.test(v)) v = v.replace(/\.0+$/, ""); // Excel turns 1023 into 1023.0
  return v ? { value: v } : { value: null };
}

function siteType(raw) {
  const v = text(raw).toLowerCase();
  const exact = SITE_TYPES.find((t) => t.toLowerCase() === v);
  return { value: exact || inferSiteType(v) || "Other" };
}

function surveyType(raw) {
  const v = text(raw).toLowerCase();
  if (/^pre|before|baseline|start/.test(v)) return { value: "pre" };
  if (/^post|after|end|final|exit/.test(v)) return { value: "post" };
  return { problem: `"${text(raw)}" isn't Pre or Post` };
}

function program(raw) {
  const v = text(raw).toLowerCase();
  if (/money|mmg|grow/.test(v)) return { value: "My Money Grows" };
  if (/colleg|workshop|univ|wellness/.test(v)) return { value: "Collegiate Workshop" };
  return { value: text(raw) }; // unknown program: keep, the review screen shows it
}

// Tidies names: collapses spaces, fixes ALL CAPS / all lowercase
function titleText(raw) {
  const v = text(raw);
  if (v !== v.toUpperCase() && v !== v.toLowerCase()) return { value: v };
  const small = new Set(["of", "the", "and", "at", "in", "for"]);
  return {
    value: v
      .toLowerCase()
      .split(" ")
      .map((w, i) => (/^(hs|ms|ga|fl|al|sc|nc|tn|tx|ny|ca|usa|ii|iii)$/.test(w) ? w.toUpperCase() : i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" "),
  };
}

// Key used to spot the same name spelled differently:
// "Lincoln H.S." / "lincoln high school" / "Lincoln HS" -> "lincoln high school"
const nameKey = (v) =>
  normalizeHeader(v)
    .replace(/\bhs\b/g, "high school")
    .replace(/\bms\b/g, "middle school")
    .replace(/\bes\b/g, "elementary school")
    .replace(/\buniv\b/g, "university")
    .replace(/\bh s\b/g, "high school")
    .replace(/\b(the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "Riverside High" = "Riverside High School". Only this one shortcut:
    // "Peachtree State University" and "Peachtree State College" are
    // different places, so university/college endings are never dropped.
    .replace(/ (high|middle|elementary) school$/, " $1");

// Which cleaner to run for each field
function cleanerFor(key, kind) {
  if (key === "survey_type") return surveyType;
  if (key === "site_type") return siteType;
  if (key === "participant_id") return participantId;
  if (key === "survey_date") return date;
  if (key === "program") return program;
  if (key === "grade_level") return grade;
  if (["school", "location", "cohort", "year"].includes(key)) return titleText;
  if (kind === "yesno") return yesno;
  if (kind === "scale") return scale;
  if (kind === "score") return score;
  if (kind === "number") return number;
  return (raw) => ({ value: text(raw) });
}

// Guess the kind of a new question from its values
function detectKind(values) {
  const vals = values.filter((v) => !isBlank(v)).map((v) => String(v));
  if (!vals.length) return null;
  const share = (fn) => vals.filter((v) => !fn(v).problem).length / vals.length;
  if (share(yesno) >= 0.8) return "yesno";
  const nums = vals.map((v) => parseFloat(v)).filter((n) => Number.isFinite(n));
  if (share((v) => scale(v, 5)) >= 0.8 && (nums.length === 0 || Math.max(...nums) <= 5)) return "scale";
  if (vals.some((v) => /%|\//.test(v)) && share((v) => score(v, 100)) >= 0.8) return "score";
  if (share(number) >= 0.8) return "number";
  return null; // free text: not stored as a question
}

// Pre or post, from words like "pre-survey", "baseline", "post test", "exit"
// in a file name, sheet name or title row. Returns 'pre', 'post' or null.
function surveyTypeFromText(textValue) {
  const v = ` ${String(textValue || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const pre = /\s(pre|pretest|presurvey|preassessment|before|baseline|intake|start|beginning)\s/.test(v);
  const post = /\s(post|posttest|postsurvey|postassessment|after|exit|end|final|followup|follow up|completion)\s/.test(v);
  if (pre && !post) return "pre";
  if (post && !pre) return "post";
  return null;
}

module.exports = {
  PROGRAMS,
  SITE_TYPES,
  inferSiteType,
  surveyTypeFromText,
  INFO_FIELDS,
  QUESTIONS,
  ALL_FIELDS,
  fieldByKey,
  matchHeader,
  normalizeHeader,
  slug,
  isBlank,
  cleanerFor,
  detectKind,
  nameKey,
  looksPrivate: (v) => /@|\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(String(v)),
};
