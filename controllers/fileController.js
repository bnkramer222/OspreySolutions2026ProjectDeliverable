// CONTROLLER - File Management (Brandon)
const fileModel = require('../models/fileModel');

exports.index = (req, res) => {
  res.render('files/index', { title: 'Files', files: fileModel.getAll() });
};
