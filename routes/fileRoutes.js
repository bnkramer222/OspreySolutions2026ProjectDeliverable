// ROUTES - File Management (Brandon)
// Routes connect each web address to the right Controller function.
// Every address here starts with /files (set in app.js).

const router = require("express").Router();
// Creates a router, a list of addresses for the Files section.

const path = require("path");
// Loads Node's path tools. Used to build folder locations and read file extensions.

const multer = require("multer");
// Loads multer, the library that receives and saves uploaded files.

const controller = require("../controllers/fileController");
// Loads my Controller, which has the functions each address runs.

const fileModel = require("../models/fileModel");
// Loads my Model, so the routes know the upload folder and the valid types.

// Save uploads to uploads/pre or uploads/post; only allow CSV/Excel
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(fileModel.UPLOAD_DIR, req.params.type)), // saves into uploads/pre or uploads/post
    filename: (req, file, cb) => cb(null, file.originalname), // keeps the file's original name
  }),
  // storage = WHERE the file is saved and WHAT it is named.
  // Uploading a file with the same name replaces the old one.

  fileFilter: (req, file, cb) => {
    const okType = fileModel.TYPES.includes(req.params.type); // checks the section is "pre" or "post"
    const okExt = [".csv", ".xlsx", ".xls"].includes(
      path.extname(file.originalname).toLowerCase(),
    ); // checks the file ends in .csv, .xlsx or .xls
    cb(null, okType && okExt); // accept the file only if both checks pass
  },
  // fileFilter = WHICH files are allowed.
  // Anything that isn't CSV or Excel is not saved.
});
// "cb" means callback. It's how we tell multer our answer
// (where to save it, what to name it, or whether to accept it).

router.get("/", controller.index);
// /files - shows both the Pre and Post sections.

router.get("/:type", controller.section);
// /files/pre or /files/post - shows just one section (where the Dashboard buttons go).
// ":type" means that part of the address can change (pre or post).

router.post("/:type/upload", upload.single("surveyFile"), controller.upload);
// /files/pre/upload or /files/post/upload - runs when the Upload button is clicked.
// upload.single("surveyFile") runs FIRST and saves the one file.
// "surveyFile" matches the name of the file input on the page.
// Then controller.upload sends the user back to the list.

router.get("/:type/:name", controller.view);
// /files/pre/survey.csv - runs when a file name is clicked, and opens that file.

module.exports = router;
// Shares these routes so app.js can use them.
