// ============================================================
// ROUTES - File Management (Brandon)
// Routes map a URL + method (GET/POST) to a controller function.
// Everything here starts with /files because app.js has:
//   app.use('/files', require('./routes/fileRoutes'));
// ============================================================

const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer"); // library that receives uploaded files
const controller = require("../controllers/fileController");
const fileModel = require("../models/fileModel");

// ---- Upload settings (multer) ----
const upload = multer({
  // Keep uploads in memory (req.files[i].buffer) instead of saving them to disk.
  // The controller then stores it in the database (Vercel can't save files to disk).
  storage: multer.memoryStorage(),

  // Vercel rejects requests bigger than about 4.5 MB, so stop at 4 MB
  // with a clear error instead. Up to 20 files per upload (story #45).
  limits: { fileSize: 4 * 1024 * 1024, files: 20 },

  // WHICH files to accept. Runs BEFORE the file is read.
  // cb(null, true) = accept, cb(null, false) = reject.
  // The tag fields come before the file in the form, so req.body
  // already has them here.
  fileFilter: (req, file, cb) => {
    // /files/upload (no section in the URL) = detect pre/post automatically
    const okType = !req.params.type || fileModel.TYPES.includes(req.params.type);
    const okExt = [".csv", ".xlsx"].includes(
      path.extname(file.originalname).toLowerCase(),
    );

    // STORY #41: Program and School/site are required; Year and Site type must be one of the choices
    const { program, school, year, site_type: siteType } = req.body;
    let problem = null;
    if (!okType) problem = "Unknown section.";
    else if (!fileModel.PROGRAMS.includes(program))
      problem = "Please choose a program.";
    else if (!school || !school.trim())
      problem = "Please enter the school or site name.";
    else if (siteType && !fileModel.SITE_TYPES.includes(siteType))
      problem = "Please choose a valid site type.";
    else if (year && !fileModel.YEARS.includes(year))
      problem = "Please choose a valid academic year.";

    req.uploadError = problem; // the controller shows this message if set
    if (problem) return cb(null, false);
    // A wrong file type only skips that file; the others still upload
    if (!okExt) {
      (req.skipped = req.skipped || []).push(
        /\.xls$/i.test(file.originalname)
          ? `"${file.originalname}" is an old Excel file (save it as .xlsx)`
          : `"${file.originalname}" isn't a CSV or Excel (.xlsx) file`,
      );
      return cb(null, false);
    }
    cb(null, true);
  },
});

// Runs multer, and turns a "file too large" error into a normal
// message for the controller instead of crashing the request.
const receiveFile = (req, res, next) =>
  upload.array("surveyFile", 20)(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      req.uploadError = "A file is too large (4 MB max per upload).";
      return next();
    }
    if (err && (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE")) {
      req.uploadError = "Too many files at once (20 max).";
      return next();
    }
    next(err);
  });

// Reads normal form fields (like the "Type DELETE" box) into req.body
const readForm = express.urlencoded({ extended: false, limit: "1mb" });

// ---- The URLs ----

// GET /files -> show both sections
router.get("/", controller.index);

// ---- Data scrubber review (must come before "/:type") ----
// GET  /files/review/12          -> what the scrubber found
// POST /files/review/12          -> re-check with the admin's column choices
// POST /files/review/12/approve  -> save the cleaned rows
// POST /files/review/12/cancel   -> throw the upload away
// POST /files/import/12          -> scrub a file uploaded before the scrubber
router.get("/review/:id(\\d+)", controller.review);
router.post("/review/:id(\\d+)", readForm, controller.saveReview);
router.post("/review/:id(\\d+)/approve", readForm, controller.saveReview);
router.post("/review/:id(\\d+)/cancel", readForm, controller.cancelReview);
router.post("/import/:id(\\d+)", readForm, controller.importStored);

// Pre/post status: who still needs a post-survey
// GET  /files/status              -> the status page
// GET  /files/status/missing.csv  -> student IDs missing a post-survey
// POST /files/expects-post/12     -> "Post-survey planned" tick box on a pre file
router.get("/status", controller.status);
router.get("/status/missing.csv", controller.missingCsv);
router.post("/expects-post/:id(\\d+)", readForm, controller.setExpectsPost);

// GET /files/pre or /files/post -> show just that section
router.get("/:type(pre|post|general)", controller.section);

// POST /files/pre/upload or /files/post/upload -> check tags, save file, save tags
// receiveFile runs FIRST and reads the files into memory (req.files).
// 'surveyFile' must match name="surveyFile" on the file input in the view.
router.post("/:type(pre|post|general)/upload", receiveFile, controller.upload);

// POST /files/upload -> same, but works out pre or post from the file itself
router.post("/upload", receiveFile, controller.upload);

// POST /files/pre/survey.csv/delete -> delete that file, then go back (stories #17, #18)
// It's POST (not GET) because it changes data.
router.post("/:type/:name/delete", readForm, controller.remove);

// GET /files/pre/survey.csv -> open that file
router.get("/:type/:name", controller.view);

module.exports = router;
