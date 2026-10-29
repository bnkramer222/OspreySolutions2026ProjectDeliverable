
// ROUTES - Dashboard (Jude)

const router = require('express').Router();
const controller = require('../controllers/dashboardController');

// Main dashboard
router.get('/', controller.index);

// Dashboard data pages
router.get('/schools', controller.schools);
router.get('/data', controller.data);

module.exports = router;
