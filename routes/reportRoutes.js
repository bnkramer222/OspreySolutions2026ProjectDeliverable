// ROUTES - Report Generation (Joshua)
const router = require("express").Router();
const controller = require("../controllers/reportController");

router.get("/", controller.index);
router.get("/export.csv", controller.exportCsv);
router.get("/questions", controller.questions);
router.post("/questions", require("express").urlencoded({ extended: false, limit: "1mb" }), controller.saveQuestions);

module.exports = router;
