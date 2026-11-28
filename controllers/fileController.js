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
const LABELS = { pre: "Pre-Survey", post: "Post-Survey" };

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
// multer (routes file) has ALREADY checked the tags and read the file
// into memory (req.file.buffer). Here we save it, run the scrubber,
// and send the admin to the review page.
exports.upload = async (req, res, next) => {
  const back = ["/files", "/files/pre", "/files/post"].includes(req.body.returnTo) ? req.body.returnTo : "/files";

  if (req.uploadError) return sendBack(res, back, "error", req.uploadError);
  if (!req.file) return sendBack(res, back, "error", "Please choose a CSV or Excel file to upload.");

  // Pre or post: chosen on the form, or worked out from the file
  // (file name, sheet name, title row, a Pre/Post column, then AI).
  const name = path.basename(req.file.originalname);
  const chosen = req.params.type || (fileModel.TYPES.includes(req.body.survey) ? req.body.survey : null);
  let type = chosen;
  let detection = { source: "chosen", detail: "Chosen when uploading." };
  if (!chosen) {
    try {
      detection = await surveyModel.detectSurveyType(req.file.buffer, name);
    } catch (err) {
      return sendBack(res, back, "error", `"${name}" couldn't be read: ${err.message}`);
    }
    type = detection.type || "pre"; // unknown: parked under Pre until the admin chooses on the review page
  }

  let id;
  try {
    id = await fileModel.save(
      type,
      name,
      req.file.buffer,
      { program: req.body.program, school: req.body.school.trim(), cohort: (req.body.cohort || "").trim(), year: req.body.year, site_type: req.body.site_type },
      req.session.user.id,
      detection,
    );
  } catch (err) {
    return next(err);
  }

  try {
    await surveyModel.prepare(id);
  } catch (err) {
    // The file couldn't be read at all (empty, wrong format...): undo the upload
    await surveyModel.discard(id).catch(() => {});
    return sendBack(res, back, "error", `"${req.file.originalname}" couldn't be read: ${err.message}`);
  }
  res.redirect(`/files/review/${id}`);
};

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
    res.render("files/review", {
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
    sendBack(res, `/files/${finalType}`, "success", `✓ "${file.name}" imported: ${count} ${count === 1 ? "response" : "responses"} added to ${LABELS[finalType]} data.`);
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
    sendBack(res, `/files/${file.type}`, "success", file.status === "new" ? `Upload of "${file.name}" cancelled. Nothing was saved.` : `The new version of "${file.name}" was discarded. The previous version is unchanged.`);
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
