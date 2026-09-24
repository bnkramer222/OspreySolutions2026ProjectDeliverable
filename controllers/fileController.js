// CONTROLLER - File Management (Brandon)
const fs = require("fs");
const fileModel = require("../models/fileModel");

// Show the Pre and Post sections with their uploaded files
exports.index = (req, res) => {
  res.render("files/index", {
    title: "Files",
    preFiles: fileModel.getAll("pre"),
    postFiles: fileModel.getAll("post"),
  });
};

// Runs after multer has saved the file
exports.upload = (req, res) => {
  res.redirect("/files");
};

// Open an uploaded file in the browser
exports.view = (req, res) => {
  const filePath = fileModel.getPath(req.params.type, req.params.name);
  if (!fileModel.TYPES.includes(req.params.type) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(filePath);
};
