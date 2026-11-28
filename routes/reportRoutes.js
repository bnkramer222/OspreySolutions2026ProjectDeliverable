// ROUTES - Report Generation (Joshua)
const router = require("express").Router();
const controller = require("../controllers/reportController");

router.get("/", controller.index);
router.get("/export.csv", controller.exportCsv);

module.exports = router;
