// ============================================================
// CONTROLLER - File Management (Brandon)
// The controller is the "middle man": a route sends a request
// here, the controller gets data from the model, then sends back
// a page (view) or a file.
// ============================================================

const fs = require("fs");
const path = require("path");
const fileModel = require("../models/fileModel");

// Heading text for each section. Add a line here to add a new section.
const LABELS = { pre: "Pre-Survey", post: "Post-Survey" };

// Builds the data for one section: { type, label, files }
const buildSection = (type) => ({
  type,
  label: LABELS[type],
  files: fileModel.getAll(type),
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
exports.index = (req, res) => {
  res.render("files/index", {
    title: "Uploaded files",
    basePath: "/files", // where to come back to after a delete
    sections: fileModel.TYPES.map(buildSection), // [pre section, post section]
    ...pageData(req),
  });
};

// GET /files/pre  or  GET /files/post
// Shows ONLY that one section (this is where the dashboard buttons go).
exports.section = (req, res) => {
  const type = req.params.type; // 'pre' or 'post', taken from the URL

  if (!fileModel.TYPES.includes(type)) {
    return res.status(404).send("Page not found");
  }

  res.render("files/index", {
    title: `${LABELS[type]} files`,
    basePath: `/files/${type}`,
    sections: [buildSection(type)],
    ...pageData(req),
  });
};

// POST /files/pre/upload  or  POST /files/post/upload
// By the time this runs, multer (in the routes file) has ALREADY
// checked the tags and saved the file to disk. Here we save its
// details + tags to the database (story #41).
exports.upload = (req, res) => {
  const { type } = req.params;
  const back = req.body.returnTo === "/files" ? "/files" : `/files/${type}`;

  // multer refused the file (missing tags or wrong file type)
  if (req.uploadError) return sendBack(res, back, "error", req.uploadError);
  if (!req.file)
    return sendBack(
      res,
      back,
      "error",
      "Please choose a CSV or Excel file to upload.",
    );

  fileModel.save(type, req.file.originalname, req.file.size, {
    program: req.body.program,
    school: req.body.school.trim(),
    cohort: (req.body.cohort || "").trim(),
    year: req.body.year,
  });

  sendBack(
    res,
    back,
    "success",
    `"${req.file.originalname}" was uploaded to ${LABELS[type]}.`,
  );
};

// GET /files/pre/survey.csv  (View button)
// Sends the file to the browser so the user can see it.
exports.view = (req, res) => {
  const filePath = fileModel.getPath(req.params.type, req.params.name);

  if (!fileModel.TYPES.includes(req.params.type) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  // CSV files display as text; Excel files download
  res.sendFile(filePath);
};

// POST /files/pre/survey.csv/delete
// STORY #17: delete a file.  STORY #18: confirm it was deleted.
// The pop-up on the page sends the word the user typed (confirmText)
// and which page they were on (returnTo).
exports.remove = (req, res) => {
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

  const result = fileModel.remove(type, name);

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
