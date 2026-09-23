// CONTROLLER - Dashboard (Jude)
const dashboardModel = require('../models/dashboardModel');

exports.index = (req, res) => {
  res.render('dashboard/index', { title: 'Dashboard', data: dashboardModel.getAll() });
};
