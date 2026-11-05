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
  // Keep the upload in memory (req.file.buffer) instead of saving it to disk.
  // The controller then stores it in the database (Vercel can't save files to disk).
  storage: multer.memoryStorage(),

  // Vercel rejects requests bigger than about 4.5 MB, so stop at 4 MB
  // with a clear error instead.
  limits: { fileSize: 4 * 1024 * 1024 },

  // WHICH files to accept. Runs BEFORE the file is read.
  // cb(null, true) = accept, cb(null, false) = reject.
  // The tag fields come before the file in the form, so req.body
  // already has them here.
  fileFilter: (req, file, cb) => {
    const okType = fileModel.TYPES.includes(req.params.type);
    const okExt = [".csv", ".xlsx", ".xls"].includes(
      path.extname(file.originalname).toLowerCase(),
    );

    // STORY #41: Program and School are required; Year must be one of the choices
    const { program, school, year } = req.body;
    let problem = null;
    if (!okType) problem = "Unknown section.";
    else if (!okExt)
      problem = `"${file.originalname}" is not a CSV or Excel file.`;
    else if (!fileModel.PROGRAMS.includes(program))
      problem = "Please choose a program.";
    else if (!school || !school.trim())
      problem = "Please enter the school or university.";
    else if (year && !fileModel.YEARS.includes(year))
      problem = "Please choose a valid academic year.";

    req.uploadError = problem; // the controller shows this message if set
    cb(null, !problem);
  },
});

// Runs multer, and turns a "file too large" error into a normal
// message for the controller instead of crashing the request.
const receiveFile = (req, res, next) =>
  upload.single("surveyFile")(req, res, (err) => {
    if (err && err.code === "LIMIT_FILE_SIZE") {
      req.uploadError = "That file is too large (4 MB max).";
      return next();
    }
    next(err);
  });

// Reads normal form fields (like the "Type DELETE" box) into req.body
const readForm = express.urlencoded({ extended: false });

// ---- The URLs ----

// GET /files -> show both sections
router.get("/", controller.index);

// GET /files/pre or /files/post -> show just that section
router.get("/:type", controller.section);

// POST /files/pre/upload or /files/post/upload -> check tags, save file, save tags
// receiveFile runs FIRST and reads the file into memory (req.file.buffer).
// 'surveyFile' must match name="surveyFile" on the file input in the view.
router.post("/:type/upload", receiveFile, controller.upload);

// POST /files/pre/survey.csv/delete -> delete that file, then go back (stories #17, #18)
// It's POST (not GET) because it changes data.
router.post("/:type/:name/delete", readForm, controller.remove);

// GET /files/pre/survey.csv -> open that file
router.get("/:type/:name", controller.view);

module.exports = router;
