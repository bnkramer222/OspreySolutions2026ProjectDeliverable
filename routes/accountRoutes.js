// ROUTES - Account Management (Victoria)
const router = require('express').Router();
const controller = require('../controllers/accountController');
const requireAuth = require('../middleware/requireAuth');

router.get('/', requireAuth, controller.index);
router.get('/login', controller.showLogin);
router.post('/login', controller.login);
router.get('/register', controller.showRegister);
router.post('/register', controller.register);
router.post('/logout', controller.logout);

module.exports = router;
