// CONTROLLER - File Management (Brandon)
// This is the Controller in MVC.
// It is the middle man between the page the user sees and the saved files.

const fs = require("fs");
// Loads Node's file tools. Used to check if a file exists.

const fileModel = require("../models/fileModel");
// Loads my Model. The Model is the only part that knows where files are saved.

const LABELS = { pre: "Pre-Survey", post: "Post-Survey" };
// The heading shown on the page for each section.

const buildSection = (type) => ({
  type, // "pre" or "post"
  label: LABELS[type], // the heading, like "Pre-Survey"
  files: fileModel.getAll(type), // asks the Model for the list of files
});
// Puts together everything the page needs to show one section.

// GET /files - both sections
exports.index = (req, res) => {
  res.render("files/index", {
    title: "Files", // page title
    sections: fileModel.TYPES.map(buildSection), // builds both Pre and Post
  });
};
// Runs when someone goes to /files.
// Shows both the Pre and Post sections on one page.

// GET /files/pre or /files/post - one section
exports.section = (req, res) => {
  const type = req.params.type; // gets "pre" or "post" from the web address
  if (!fileModel.TYPES.includes(type))
    return res.status(404).send("Page not found"); // stops anything that isn't pre or post
  res.render("files/index", {
    title: LABELS[type], // page title, like "Pre-Survey"
    sections: [buildSection(type)], // builds just this one section
  });
};
// Runs when someone clicks the Pre or Post button on the Dashboard.
// Shows only that one section, so pre and post files stay separate.

// POST /files/:type/upload - multer already saved the file
exports.upload = (req, res) => {
  res.redirect(`/files/${req.params.type}`); // goes back to the section they uploaded to
};
// Runs after a file is uploaded.
// The file is already saved by multer (set up in the routes file).
// This just sends the user back, where the new file now shows in the list.

// GET /files/:type/:name - open a file
exports.view = (req, res) => {
  const filePath = fileModel.getPath(req.params.type, req.params.name); // asks the Model where the file is
  if (!fileModel.TYPES.includes(req.params.type) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found"); // stops if the section is wrong or the file doesn't exist
  }
  res.sendFile(filePath); // sends the file to the browser
};
// Runs when someone clicks a file name.
// CSV files open in the browser. Excel files download.
