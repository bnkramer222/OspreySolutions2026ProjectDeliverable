// ============================================================
// SCRUBBER - optional AI helper using Groq's FREE tier (Brandon)
// The rules in fields.js do almost all of the cleaning. The AI is only
// asked about things rules can't settle:
//   1. column names the rules don't recognize ("Q1 how sure r u w/ $")
//   2. different spellings of the same school/program/cohort ("LHS")
// It is sent column headers, a few short sample answers, and school /
// program / cohort names. It is NEVER sent student names, emails,
// phone numbers or student IDs.
//
// Setup: put GROQ_API_KEY in Vercel's environment variables (or .env).
// Optional: GROQ_MODEL to pick a different model.
// If there's no key, or the free daily limit is used up, the scrubber
// keeps working without AI and the admin matches the rest by hand.
// ============================================================

const db = require("../../db/database");

const URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const available = () => Boolean(process.env.GROQ_API_KEY);

// Counts requests per day so the upload page can show usage
async function recordUsage(tokens) {
  await db
    .run(
      `INSERT INTO ai_usage (day, requests, tokens) VALUES (CURRENT_DATE, 1, $1)
       ON CONFLICT (day) DO UPDATE SET requests = ai_usage.requests + 1, tokens = ai_usage.tokens + $1`,
      [tokens || 0],
    )
    .catch(() => {});
}

async function usageToday() {
  const row = await db.get("SELECT requests, tokens FROM ai_usage WHERE day = CURRENT_DATE");
  return { requests: row ? row.requests : 0, tokens: row ? row.tokens : 0, enabled: available(), model: MODEL };
}

// Sends one question, expects a JSON object back.
// Returns { ok: true, data } or { ok: false, status, message }.
async function askJson(system, user) {
  if (!available()) return { ok: false, status: "no_key", message: "No GROQ_API_KEY set, so AI suggestions are off." };
  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429)
      return { ok: false, status: "limit", message: "The free AI limit is used up for now. Match the remaining items by hand or try again later." };
    if (!response.ok) return { ok: false, status: "error", message: `AI service error (${response.status}).` };
    const body = await response.json();
    await recordUsage(body.usage && body.usage.total_tokens);
    return { ok: true, data: JSON.parse(body.choices[0].message.content) };
  } catch (err) {
    return { ok: false, status: "error", message: `AI service unavailable (${err.name === "TimeoutError" ? "timed out" : err.message}).` };
  }
}

// unknown: [{ header, samples: [..] }], fields: [{ key, label, kind }]
// -> { header: fieldKey | "new" | "ignore" }
async function suggestColumns(unknown, fields) {
  const system =
    "You map messy survey spreadsheet column headers to a fixed list of fields for a youth financial-literacy program. " +
    'Reply with JSON: {"mappings": {"<header>": "<field key>"}}. Use only the given field keys. ' +
    'Use "new" for a real survey question that fits no field, and "ignore" for anything else (notes, row numbers, teacher comments). ' +
    "Never map two headers to the same field unless they are clearly duplicates.";
  const user = JSON.stringify({ fields: fields.map(({ key, label, kind }) => ({ key, label, kind })), headers: unknown });
  const result = await askJson(system, user);
  if (!result.ok) return result;
  const valid = new Set([...fields.map((f) => f.key), "new", "ignore"]);
  const mappings = {};
  for (const [header, key] of Object.entries(result.data.mappings || {}))
    if (valid.has(key) && unknown.some((u) => u.header === header)) mappings[header] = key;
  return { ok: true, data: mappings };
}

// field: "school", values: ["LHS", "Lincoln High", ...], known: ["Lincoln High School", ...]
// -> { "LHS": "Lincoln High School", ... } (only values that should change)
async function suggestValues(field, values, known) {
  const system =
    `You clean the "${field}" column of a survey spreadsheet. Some values are the same ${field} spelled differently or abbreviated. ` +
    'Reply with JSON: {"fixes": {"<value as given>": "<canonical name>"}}. Prefer a name from "known" when it is clearly the same place/thing. ' +
    "Otherwise pick the clearest full spelling among the values. Only include values that should change. Do not invent places.";
  const result = await askJson(system, JSON.stringify({ values, known }));
  if (!result.ok) return result;
  const fixes = {};
  for (const [raw, canonical] of Object.entries(result.data.fixes || {}))
    if (values.includes(raw) && typeof canonical === "string" && canonical.trim() && canonical !== raw) fixes[raw] = canonical.trim();
  return { ok: true, data: fixes };
}

module.exports = { available, usageToday, suggestColumns, suggestValues, MODEL };
