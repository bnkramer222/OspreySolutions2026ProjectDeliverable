// CONTROLLER - Account Management (Victoria)
const accountModel = require('../models/accountModel');

exports.index = (req, res) => {
  res.render('account/index', { title: 'Account', accounts: accountModel.getAll() });
};
