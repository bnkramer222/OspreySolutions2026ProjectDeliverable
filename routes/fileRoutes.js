// ROUTES - File Management (Brandon)
const router = require("express").Router();
const path = require("path");
const multer = require("multer");
const controller = require("../controllers/fileController");
const fileModel = require("../models/fileModel");

// Save uploads to uploads/pre or uploads/post; only allow CSV/Excel
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) =>
      cb(null, path.join(fileModel.UPLOAD_DIR, req.params.type)),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
  fileFilter: (req, file, cb) => {
    const okType = fileModel.TYPES.includes(req.params.type);
    const okExt = [".csv", ".xlsx", ".xls"].includes(
      path.extname(file.originalname).toLowerCase(),
    );
    cb(null, okType && okExt);
  },
});

router.get("/", controller.index);
router.get("/:type", controller.section);
router.post("/:type/upload", upload.single("surveyFile"), controller.upload);
router.get("/:type/:name", controller.view);

module.exports = router;
