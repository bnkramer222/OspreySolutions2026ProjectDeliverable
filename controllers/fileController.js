// ============================================================
// CONTROLLER - File Management (Brandon)
// The controller is the "middle man": a route sends a request
// here, the controller gets data from the model, then sends back
// a page (view) or a file.
// Model calls hit the database, so they're async: every one uses
// "await", and errors go to next(err) (the error page in app.js).
// ============================================================

const path = require("path");
const fileModel = require("../models/fileModel");

// Heading text for each section. Add a line here to add a new section.
const LABELS = { pre: "Pre-Survey", post: "Post-Survey" };

// Builds the data for one section: { type, label, files }
const buildSection = async (type) => ({
  type,
  label: LABELS[type],
  files: await fileModel.getAll(type),
});

// Data every version of the page needs
const pageData = (req) => ({
  programs: fileModel.PROGRAMS, // dropdown choices (story #41)
  years: fileModel.YEARS,
  success: req.query.success || null, // green banner text, e.g. after upload/delete
  error: req.query.error || null, // red banner text
});

// Sends the user back to a page with a green or red message,
// e.g. /files/pre?success=...  The message shows in a banner.
const sendBack = (res, url, key, text) =>
  res.redirect(`${url}?${key}=${encodeURIComponent(text)}`);

// GET /files
// Shows BOTH the Pre and Post sections on one page.
exports.index = async (req, res, next) => {
  try {
    res.render("files/index", {
      title: "Uploaded files",
      basePath: "/files", // where to come back to after a delete
      sections: await Promise.all(fileModel.TYPES.map(buildSection)), // [pre section, post section]
      ...pageData(req),
    });
  } catch (err) {
    next(err);
  }
};

// GET /files/pre  or  GET /files/post
// Shows ONLY that one section (this is where the dashboard buttons go).
exports.section = async (req, res, next) => {
  const type = req.params.type; // 'pre' or 'post', taken from the URL

  if (!fileModel.TYPES.includes(type)) {
    return res.status(404).send("Page not found");
  }

  try {
    res.render("files/index", {
      title: `${LABELS[type]} files`,
      basePath: `/files/${type}`,
      sections: [await buildSection(type)],
      ...pageData(req),
    });
  } catch (err) {
    next(err);
  }
};

// POST /files/pre/upload  or  POST /files/post/upload
// By the time this runs, multer (in the routes file) has ALREADY
// checked the tags and read the file into memory (req.file.buffer).
// Here we save the file + its details + tags to the database (story #41).
exports.upload = async (req, res, next) => {
  const { type } = req.params;
  const back = req.body.returnTo === "/files" ? "/files" : `/files/${type}`;

  // multer refused the file (missing tags, wrong file type or too large)
  if (req.uploadError) return sendBack(res, back, "error", req.uploadError);
  if (!req.file)
    return sendBack(
      res,
      back,
      "error",
      "Please choose a CSV or Excel file to upload.",
    );

  try {
    await fileModel.save(type, req.file.originalname, req.file.buffer, {
      program: req.body.program,
      school: req.body.school.trim(),
      cohort: (req.body.cohort || "").trim(),
      year: req.body.year,
    });
  } catch (err) {
    return next(err);
  }

  sendBack(
    res,
    back,
    "success",
    `"${req.file.originalname}" was uploaded to ${LABELS[type]}.`,
  );
};

// GET /files/pre/survey.csv  (View button)
// Sends the file to the browser so the user can see it.
exports.view = async (req, res, next) => {
  const { type, name } = req.params;

  if (!fileModel.TYPES.includes(type)) {
    return res.status(404).send("File not found");
  }

  try {
    const file = await fileModel.getFile(type, path.basename(name));
    if (!file || !file.content) return res.status(404).send("File not found");

    // Same content type as before (.csv -> text/csv, .xlsx -> Excel)
    res.type(path.extname(file.name));
    res.send(file.content);
  } catch (err) {
    next(err);
  }
};

// POST /files/pre/survey.csv/delete
// STORY #17: delete a file.  STORY #18: confirm it was deleted.
// The pop-up on the page sends the word the user typed (confirmText)
// and which page they were on (returnTo).
exports.remove = async (req, res, next) => {
  const { type } = req.params;
  const name = path.basename(req.params.name); // just the file name, no folders

  if (!fileModel.TYPES.includes(type)) {
    return res.status(404).send("Page not found");
  }

  // Only allow going back to our own two pages
  const back = req.body.returnTo === "/files" ? "/files" : `/files/${type}`;

  // Double-check the typed word here too, in case the page's
  // JavaScript was skipped. The file is only deleted if it says DELETE.
  if ((req.body.confirmText || "").trim() !== "DELETE") {
    return sendBack(
      res,
      back,
      "error",
      `"${name}" was not deleted. Type DELETE to confirm.`,
    );
  }

  let result;
  try {
    result = await fileModel.remove(type, name);
  } catch (err) {
    return next(err);
  }

  if (result === "deleted") {
    return sendBack(
      res,
      back,
      "success",
      `✓ "${name}" was deleted. It no longer appears in the list below.`,
    );
  }
  if (result === "missing") {
    return sendBack(
      res,
      back,
      "error",
      `"${name}" was not found. It may already be deleted.`,
    );
  }
  return sendBack(
    res,
    back,
    "error",
    `"${name}" could not be deleted. Please try again.`,
  );
};
