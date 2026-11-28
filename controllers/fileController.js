// ============================================================
// CONTROLLER - File Management (Brandon)
// The controller is the "middle man": a route sends a request
// here, the controller gets data from the model, then sends back
// a page (view) or a file.
// Upload flow (with the data scrubber):
//   upload -> scrub -> REVIEW page -> admin approves -> rows saved
// Model calls hit the database, so they're async: every one uses
// "await", and errors go to next(err) (the error page in app.js).
// ============================================================

const path = require("path");
const fileModel = require("../models/fileModel");
const surveyModel = require("../models/surveyModel");
const F = require("../models/scrubber/fields");

// Heading text for each section. Add a line here to add a new section.
const LABELS = { pre: "Pre-Survey", post: "Post-Survey", general: "General survey" };

const buildSection = async (type) => ({
  type,
  label: LABELS[type],
  files: await fileModel.getAll(type),
});

// Data every version of the files page needs
const pageData = async (req) => ({
  programs: fileModel.PROGRAMS, // dropdown choices (story #41)
  siteTypes: fileModel.SITE_TYPES,
  years: fileModel.YEARS,
  labels: LABELS,
  aiUsage: await surveyModel.aiUsage(),
  success: req.query.success || null, // green banner text
  error: req.query.error || null, // red banner text
});

// Sends the user back to a page with a green or red message.
const sendBack = (res, url, key, text) => res.redirect(`${url}?${key}=${encodeURIComponent(text)}`);

// GET /files  -> both sections.  GET /files/pre or /files/post -> one section.
exports.index = async (req, res, next) => {
  const type = req.params.type;
  if (type && !fileModel.TYPES.includes(type)) return res.status(404).send("Page not found");
  try {
    res.render("files/index", {
      title: type ? `${LABELS[type]} files` : "Survey files",
      basePath: type ? `/files/${type}` : "/files",
      current: type || "all",
      sections: await Promise.all((type ? [type] : fileModel.TYPES).map(buildSection)),
      ...(await pageData(req)),
    });
  } catch (err) {
    next(err);
  }
};
exports.section = exports.index;

// POST /files/pre/upload  or  POST /files/post/upload
// multer (routes file) has ALREADY checked the tags and read the files
// into memory (req.files[i].buffer). Here we save each one, run the
// scrubber, and send the admin to review them one after another.
exports.upload = async (req, res, next) => {
  const back = ["/files", "/files/pre", "/files/post", "/files/general"].includes(req.body.returnTo) ? req.body.returnTo : "/files";
  const files = req.files || [];
  const skipped = req.skipped || [];

  if (req.uploadError) return sendBack(res, back, "error", req.uploadError);
  if (!files.length)
    return sendBack(res, back, "error", skipped.length ? `Nothing uploaded: ${skipped.join("; ")}.` : "Please choose a CSV or Excel file to upload.");

  // Every file gets the same tags. Each one is checked, scrubbed and
  // parked for review; then the admin reviews them one after another.
  const chosen = req.params.type || (fileModel.TYPES.includes(req.body.survey) ? req.body.survey : null);
  const tags = { program: req.body.program, school: req.body.school.trim(), cohort: (req.body.cohort || "").trim(), year: req.body.year, site_type: req.body.site_type };
  const queue = [];
  const failed = [...skipped];
  for (const f of files) {
    const name = path.basename(f.originalname);
    try {
      // Pre, post or general: chosen on the form, or worked out from the file
      // (survey type column, file name, sheet name, title row, then AI).
      let type = chosen;
      let detection = { source: "chosen", detail: "Chosen when uploading." };
      if (!chosen) {
        detection = await surveyModel.detectSurveyType(f.buffer, name);
        type = detection.type || "pre"; // unknown: the admin chooses on the review page
      }
      const id = await fileModel.save(type, name, f.buffer, tags, req.session.user.id, detection);
      try {
        await surveyModel.prepare(id);
        queue.push(id);
      } catch (err) {
        await surveyModel.discard(id).catch(() => {});
        failed.push(`"${name}" couldn't be read: ${err.message}`);
      }
    } catch (err) {
      failed.push(`"${name}" couldn't be read: ${err.message}`);
    }
  }

  if (!queue.length) return sendBack(res, back, "error", failed.join(" "));
  req.session.reviewQueue = queue;
  await saveSession(req);
  const note = queue.length > 1 ? `${queue.length} files uploaded. Review each one, then approve it.` : "";
  const problems = failed.length ? ` Not uploaded: ${failed.join("; ")}.` : "";
  const params = new URLSearchParams();
  if (note || problems) params.set(problems ? "error" : "success", (note + problems).trim());
  res.redirect(`/files/review/${queue[0]}${params.toString() ? "?" + params : ""}`);
};

// After approving or cancelling: the next file from the same upload that
// still needs review, or null when the batch is done.
async function nextInQueue(req, doneId) {
  const queue = (req.session.reviewQueue || []).filter((id) => id !== doneId);
  let next = null;
  for (const id of queue) {
    const f = await surveyModel.getStaged(id);
    if (f && f.staging) {
      next = id;
      break;
    }
  }
  req.session.reviewQueue = next ? queue : [];
  await saveSession(req);
  return next;
}

// Saves the session before redirecting, so the next page sees the queue
const saveSession = (req) => new Promise((resolve) => req.session.save(() => resolve()));

// POST /files/import/:id -> scrub a file that was uploaded before the scrubber existed
exports.importStored = async (req, res, next) => {
  try {
    await surveyModel.prepare(Number(req.params.id));
    res.redirect(`/files/review/${req.params.id}`);
  } catch (err) {
    if (err.message === "File not found") return res.status(404).send("File not found");
    sendBack(res, "/files", "error", `That file couldn't be read: ${err.message}`);
  }
};

// GET /files/review/:id -> what the scrubber found, before anything is saved
exports.review = async (req, res, next) => {
  try {
    const file = await surveyModel.getStaged(Number(req.params.id));
    if (!file) return res.status(404).send("File not found");
    if (!file.staging) return sendBack(res, `/files/${file.type}`, "success", `"${file.name}" has no changes waiting for review.`);
    const { result, overrides } = file.staging;
    const queue = req.session.reviewQueue || [];
    const position = queue.indexOf(file.id);
    res.render("files/review", {
      batch: position >= 0 && queue.length > 1 ? { index: position + 1, total: queue.length, next: queue[position + 1] || null } : null,
      detection: file.type_detection || { source: "chosen", detail: "" },
      title: `Review ${file.name}`,
      file,
      label: LABELS[file.type],
      result,
      rejected: new Set((overrides && overrides.rejected) || []),
      fieldChoices: F.ALL_FIELDS.map(({ key, label, kind }) => ({ key, label, group: kind ? "Survey questions" : "Student / session details" })),
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (err) {
    next(err);
  }
};

// Reads the admin's choices from the review form into "overrides"
function readOverrides(body, result) {
  const columns = {};
  for (const col of result.columns) {
    const choice = body[`col_${col.index}`];
    if (choice && choice !== col.field) columns[col.header] = choice;
    else if (col.source === "admin") columns[col.header] = col.field; // keep earlier choices
  }
  const rejected = result.changes.filter((c) => c.source !== "rule" && !body[`keep_${c.id}`]).map((c) => c.id);
  return { columns, rejected };
}
const sameOverrides = (a, b) => JSON.stringify(a || {}) === JSON.stringify({ columns: (b || {}).columns || {}, rejected: (b || {}).rejected || [] });

// POST /files/review/:id -> re-run the scrubber with the admin's changes
// POST /files/review/:id/approve -> (re-run if needed, then) save the rows
exports.saveReview = async (req, res, next) => {
  const id = Number(req.params.id);
  const approving = req.path.endsWith("/approve");
  try {
    const file = await surveyModel.getStaged(id);
    if (!file || !file.staging) return res.redirect("/files");
    const overrides = readOverrides(req.body, file.staging.result);
    // Pre/Post chosen (or corrected) on the review page
    const picked = fileModel.TYPES.includes(req.body.surveyType) ? req.body.surveyType : null;
    const unknown = file.type_detection && file.type_detection.source === "unknown";
    let typeChanged = false;
    if (picked && (picked !== file.type || unknown)) {
      const detection = { source: "admin", detail: "Chosen on the review page." };
      if (picked !== file.type) await surveyModel.moveSection(id, picked, detection);
      else await require("../db/database").run("UPDATE files SET type_detection = $2 WHERE id = $1", [id, JSON.stringify(detection)]);
      typeChanged = picked !== file.type;
    }
    if (typeChanged || !sameOverrides(overrides, file.staging.overrides)) await surveyModel.prepare(id, { ...overrides, reuseAi: true });
    if (!approving) return sendBack(res, `/files/review/${id}`, "success", "Updated. Check the preview below.");
    const count = await surveyModel.approve(id, req.session.user.id);
    const finalType = picked || file.type;
    const message = `✓ "${file.name}" imported: ${count} ${count === 1 ? "response" : "responses"} added to ${LABELS[finalType]} data.`;
    const next = await nextInQueue(req, id);
    if (next) return sendBack(res, `/files/review/${next}`, "success", `${message} Next file:`);
    sendBack(res, `/files/${finalType}`, "success", message);
  } catch (err) {
    if (/couldn't|can't|isn't|No survey answers|empty|already has|Choose whether/.test(err.message)) return sendBack(res, `/files/review/${id}`, "error", err.message);
    next(err);
  }
};

// POST /files/review/:id/cancel -> nothing is saved
exports.cancelReview = async (req, res, next) => {
  try {
    const file = await surveyModel.getStaged(Number(req.params.id));
    if (!file) return res.redirect("/files");
    await surveyModel.discard(file.id);
    const message = file.status === "new" ? `Upload of "${file.name}" cancelled. Nothing was saved.` : `The new version of "${file.name}" was discarded. The previous version is unchanged.`;
    const next = await nextInQueue(req, file.id);
    if (next) return sendBack(res, `/files/review/${next}`, "success", `${message} Next file:`);
    sendBack(res, `/files/${file.type}`, "success", message);
  } catch (err) {
    next(err);
  }
};

// GET /files/pre/survey.csv  (View/Download button) -> the original file
exports.view = async (req, res, next) => {
  const { type, name } = req.params;
  if (!fileModel.TYPES.includes(type)) return res.status(404).send("Page not found");
  try {
    const file = await fileModel.getFile(type, path.basename(name));
    if (!file || !file.content) return res.status(404).send("File not found");
    res.type(path.extname(file.name));
    res.attachment(file.name);
    res.send(file.content);
  } catch (err) {
    next(err);
  }
};

// POST /files/pre/survey.csv/delete
// STORY #17: delete a file.  STORY #18: confirm it was deleted.
exports.remove = async (req, res, next) => {
  const { type } = req.params;
  const name = path.basename(req.params.name);
  if (!fileModel.TYPES.includes(type)) return res.status(404).send("Page not found");
  const back = req.body.returnTo === "/files" ? "/files" : `/files/${type}`;

  // Double-check the typed word here too, in case the page's JavaScript was skipped
  if ((req.body.confirmText || "").trim() !== "DELETE")
    return sendBack(res, back, "error", `"${name}" was not deleted. Type DELETE to confirm.`);

  let result;
  try {
    result = await fileModel.remove(type, name);
  } catch (err) {
    return next(err);
  }
  if (result === "deleted") return sendBack(res, back, "success", `✓ "${name}" and its survey responses were deleted.`);
  if (result === "missing") return sendBack(res, back, "error", `"${name}" was not found. It may already be deleted.`);
  return sendBack(res, back, "error", `"${name}" could not be deleted. Please try again.`);
};

// GET /files/status -> which groups still need post-surveys
exports.status = async (req, res, next) => {
  try {
    const groups = await surveyModel.completion();
    res.render("files/status", {
      title: "Pre/post status",
      groups,
      current: "status",
      success: req.query.success || null,
      error: req.query.error || null,
    });
  } catch (err) {
    next(err);
  }
};

// GET /files/status/missing.csv?school=..&program=..&cohort=.. -> student IDs with a pre but no post
exports.missingCsv = async (req, res, next) => {
  try {
    const want = (v) => String(v || "");
    const group = (await surveyModel.completion()).find(
      (g) => want(g.school) === want(req.query.school) && want(g.program) === want(req.query.program) && want(g.cohort) === want(req.query.cohort),
    );
    if (!group) return res.status(404).send("Group not found");
    const lines = ["Student ID,School / site,Program,Cohort", ...group.preOnly.map((id) => [id, group.school, group.program, group.cohort].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(","))];
    const name = `missing_post_${[group.school, group.cohort].filter(Boolean).join("_")}`.replace(/[^a-z0-9]+/gi, "_");
    res.attachment(`${name}.csv`).type("text/csv").send("\ufeff" + lines.join("\r\n"));
  } catch (err) {
    next(err);
  }
};

// POST /files/expects-post/12 -> tick/untick "Post-survey planned" on a pre file
exports.setExpectsPost = async (req, res, next) => {
  try {
    await fileModel.setExpectsPost(Number(req.params.id), req.body.expectsPost === "1");
    const back = ["/files", "/files/pre", "/files/status"].includes(req.body.returnTo) ? req.body.returnTo : "/files/pre";
    res.redirect(back);
  } catch (err) {
    next(err);
  }
};
