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
  storage: multer.diskStorage({
    // WHERE to save: uploads/pre or uploads/post,
    // based on the :type part of the URL
    destination: (req, file, cb) =>
      cb(null, path.join(fileModel.UPLOAD_DIR, req.params.type)),

    // WHAT to name it: keep the original file name.
    // (Uploading the same name again replaces the old file.)
    filename: (req, file, cb) => cb(null, file.originalname),
  }),

  // WHICH files to accept. Runs BEFORE the file is saved.
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

// Reads normal form fields (like the "Type DELETE" box) into req.body
const readForm = express.urlencoded({ extended: false });

// ---- The URLs ----

// GET /files -> show both sections
router.get("/", controller.index);

// GET /files/pre or /files/post -> show just that section
router.get("/:type", controller.section);

// POST /files/pre/upload or /files/post/upload -> check tags, save file, save tags
// upload.single('surveyFile') runs FIRST and saves the file.
// 'surveyFile' must match name="surveyFile" on the file input in the view.
router.post("/:type/upload", upload.single("surveyFile"), controller.upload);

// POST /files/pre/survey.csv/delete -> delete that file, then go back (stories #17, #18)
// It's POST (not GET) because it changes data.
router.post("/:type/:name/delete", readForm, controller.remove);

// GET /files/pre/survey.csv -> open that file
router.get("/:type/:name", controller.view);

module.exports = router;
