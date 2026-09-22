const router = require('express').Router();
const controller = require('../controllers/accountController');

router.get('/', controller.index);

module.exports = router;
