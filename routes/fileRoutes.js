const router = require('express').Router();
const controller = require('../controllers/fileController');

router.get('/', controller.index);

module.exports = router;
