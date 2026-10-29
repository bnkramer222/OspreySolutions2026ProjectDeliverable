// CONTROLLER - Report Generation (Joshua)
const reportModel = require("../models/reportModel");
// GET /reports?pre=file.csv&post=file.csv&action=preview|generate|settings
exports.index = (req, res) => {
  const { pre, post } = req.query;
  const action = req.query.action || "generate";
  let report = null;
  let fields = [];
  let selectedFields = [];
  let error = null;
  let emptyMessage = null;
  const pair = JSON.stringify([pre, post]);
  if (pre && post) {
    try {
      if (typeof pre !== "string" || typeof post !== "string") throw new Error("Invalid files");
      const comparison = reportModel.build(pre, post);
      fields = comparison.fields;
      const explicit = req.query.fieldsSet === "1" && req.query.fieldPair === pair;
      const requested = req.query.fields === undefined ? [] :
        (Array.isArray(req.query.fields) ? req.query.fields : [req.query.fields]);
      selectedFields = explicit ? fields.filter((field) => requested.includes(field)) : fields;
      if (action !== "settings" && explicit && requested.some((field) => typeof field !== "string" || !fields.includes(field))) {
        error = "Choose fields available in the selected survey files.";
      } else if (action !== "settings" && fields.length && explicit && selectedFields.length === 0) {
        error = "Select at least one report field.";
      } else if (action !== "settings") {
        report = { ...comparison, rows: comparison.rows.filter((row) => selectedFields.includes(row.column)) };
        if (report.preCount === 0 || report.postCount === 0) {
          emptyMessage = "One or both selected files contain no data records. Choose files with survey responses.";
        } else if (fields.length === 0) {
          emptyMessage = "Both files were read, but there are no comparable number or Yes/No questions. Choose different files.";
        } else if (report.rows.length === 0) {
          emptyMessage = "The selected questions do not have usable answers in both surveys. Choose other fields or files.";
        }
      }
    } catch (err) {
      error = "Could not read those files. Make sure both are valid CSV files.";
    }
  }
  if ((!pre || !post) && (pre || post || req.query.action === "preview" || req.query.action === "generate") && action !== "settings") {
    error = "Choose both a Pre-Survey and a Post-Survey file.";
  }
  res.render("reports/index", {
    title: "Reports",
    preFiles: reportModel.listCsvFiles("pre"),
    postFiles: reportModel.listCsvFiles("post"),
    selected: { pre, post },
    fields, selectedFields, pair,
    preview: action === "preview",
    settingsOpen: req.query.settingsOpen === "1" || Boolean(error && fields.length),
    autoPrint: action === "generate" && req.query.print === "1" && Boolean(report && !emptyMessage && !error),
    report,
    noResults: Boolean(emptyMessage),
    emptyMessage,
    error,
  });
};
