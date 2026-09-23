// CONTROLLER - Report Generation (Joshua)
const reportModel = require('../models/reportModel');

exports.index = (req, res) => {
  res.render('reports/index', { title: 'Reports', reports: reportModel.getAll() });
};
