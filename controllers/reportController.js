// CONTROLLER - Report Generation (Joshua)
const reportModel = require("../models/reportModel");

// GET /reports?pre=file.csv&post=file.csv
exports.index = (req, res) => {
  const { pre, post } = req.query;
  let report = null;
  let error = null;

  // Only build a report once both files are picked
  if (pre && post) {
    try {
      report = reportModel.build(pre, post);
    } catch (err) {
      error = "Could not read those files. Make sure both are valid CSV files.";
    }
  }

  res.render("reports/index", {
    title: "Reports",
    preFiles: reportModel.listCsvFiles("pre"),
    postFiles: reportModel.listCsvFiles("post"),
    selected: { pre, post },
    report,
    error,
  });
};
