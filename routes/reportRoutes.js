const router = require('express').Router();
const controller = require('../controllers/reportController');

router.get('/', controller.index);

module.exports = router;
