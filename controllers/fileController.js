// CONTROLLER - File Management (Brandon)
const fs = require("fs");
const fileModel = require("../models/fileModel");

const LABELS = { pre: "Pre-Survey", post: "Post-Survey" };

const buildSection = (type) => ({
  type,
  label: LABELS[type],
  files: fileModel.getAll(type),
});

// GET /files - both sections
exports.index = (req, res) => {
  res.render("files/index", {
    title: "Files",
    sections: fileModel.TYPES.map(buildSection),
  });
};

// GET /files/pre or /files/post - one section
exports.section = (req, res) => {
  const type = req.params.type;
  if (!fileModel.TYPES.includes(type))
    return res.status(404).send("Page not found");
  res.render("files/index", {
    title: LABELS[type],
    sections: [buildSection(type)],
  });
};

// POST /files/:type/upload - multer already saved the file
exports.upload = (req, res) => {
  res.redirect(`/files/${req.params.type}`);
};

// GET /files/:type/:name - open a file
exports.view = (req, res) => {
  const filePath = fileModel.getPath(req.params.type, req.params.name);
  if (!fileModel.TYPES.includes(req.params.type) || !fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.sendFile(filePath);
};
