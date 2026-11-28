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

const BASE = "https://api.groq.com/openai/v1";
const URL = `${BASE}/chat/completions`;
const MODEL = (process.env.GROQ_MODEL || "").trim() || "openai/gpt-oss-120b";

// Models to try, best first. If the key can't use one (Groq answers 404),
// the app asks Groq which models this key CAN use and switches to the
// best one available. The choice is remembered until the server restarts.
const PREFERRED = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
let activeModel = MODEL;

async function pickAvailableModel() {
  const response = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const ids = ((await response.json()).data || []).filter((m) => m.active !== false).map((m) => m.id);
  const usable = ids.filter((id) => !/whisper|tts|guard|playai|orpheus|distil|compound/i.test(id));
  return PREFERRED.find((id) => usable.includes(id)) || usable[0] || null;
}

// Pulls the JSON object out of a reply, even if the model wrapped it in text
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw e;
  }
}

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
  return { requests: row ? row.requests : 0, tokens: row ? row.tokens : 0, enabled: available(), model: activeModel };
}

// Sends one question, expects a JSON object back.
// Returns { ok: true, data } or { ok: false, status, message }.
async function askJson(system, user, retried = false) {
  if (!available()) return { ok: false, status: "no_key", message: "No GROQ_API_KEY set, so AI suggestions are off." };
  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: activeModel,
        temperature: 0,
        // Some models don't support JSON mode; the retry below drops it
        ...(retried === "plain" ? {} : { response_format: { type: "json_object" } }),
        messages: [
          { role: "system", content: system + " Reply with the JSON object only." },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429)
      return { ok: false, status: "limit", message: "The free AI limit is used up for now. Match the remaining items by hand or try again later." };
    if (!response.ok) {
      // Show Groq's own reason (wrong model name, bad key...) so it can be fixed
      let reason = "";
      try {
        const body = await response.json();
        reason = (body.error && (body.error.message || body.error.code)) || "";
      } catch (e) { /* not JSON */ }
      console.error(`Groq error ${response.status} (model ${activeModel}): ${reason}`);
      // This key can't use the model: switch to one it can use, then try once more
      if (response.status === 404 && !retried) {
        const next = await pickAvailableModel().catch(() => null);
        if (next && next !== activeModel) {
          console.log(`Groq: switching AI model from ${activeModel} to ${next}`);
          activeModel = next;
          return askJson(system, user, true);
        }
      }
      // JSON mode not supported by this model: try once without it
      if (response.status === 400 && /response_format|json/i.test(reason) && retried !== "plain")
        return askJson(system, user, "plain");
      return { ok: false, status: "error", message: `AI service error (${response.status}${reason ? `: ${reason.slice(0, 160)}` : ""}).` };
    }
    const body = await response.json();
    await recordUsage(body.usage && body.usage.total_tokens);
    return { ok: true, data: parseJson(body.choices[0].message.content) };
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

// Is this file a pre-survey, a post-survey or a general survey? Only used when the file
// name, sheet name and title rows don't say. Sent: file name, sheet
// name, title rows and column headers (no student answers).
// -> "pre" | "post" | null
async function suggestSurveyType(info) {
  const system =
    "A youth financial-literacy nonprofit gives students a survey before a program (pre), after it (post), " +
    "and sometimes a one-off general survey that isn't part of a before/after pair (event feedback, a check-in, an interest poll). " +
    'Decide which one this spreadsheet is from its file name, sheet name, title rows and column headers. Reply with JSON: {"type": "pre" | "post" | "general" | "unknown", "reason": "<short reason>"}. ' +
    'Answer "unknown" unless there is a real clue (for example "What did you learn?" suggests post; "Rate today\'s event" suggests general).';
  const result = await askJson(system, JSON.stringify(info));
  if (!result.ok) return result;
  const type = ["pre", "post", "general"].includes(result.data.type) ? result.data.type : null;
  return { ok: true, data: { type, reason: String(result.data.reason || "").slice(0, 160) } };
}

module.exports = { available, usageToday, suggestColumns, suggestValues, suggestSurveyType, get MODEL() { return activeModel; } };
