const express = require("express");
const multer = require("multer");
const path = require("path");
const requireAuth = require("../middleware/requireAuth");
const reportController = require("../controllers/reportController");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname).toLowerCase() !== ".csv") {
            const error = new Error("Only .csv files can be uploaded.");
            error.status = 400;
            return callback(error);
        }

        callback(null, true);
    }
});

function receiveCsv(req, res, next) {
    upload.single("dataset")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "The CSV file must be 5 MB or smaller." });
        }

        if (error instanceof multer.MulterError) {
            return res.status(400).json({ error: "Unable to read the uploaded CSV file." });
        }

        res.status(error.status || 400).json({ error: error.message || "Unable to read the uploaded CSV file." });
    });
}

router.use(requireAuth);
router.get("/", reportController.listDatasets);
router.post("/", receiveCsv, reportController.uploadDataset);
router.get("/:id/report", reportController.getReport);

module.exports = router;
