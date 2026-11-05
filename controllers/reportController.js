// CONTROLLER - Report Generation (Joshua)
// reportModel reads files from the database, so its calls are async ("await").
const reportModel = require("../models/reportModel");

// GET /reports: normal HTML, or explicitly requested availability/preview JSON.
exports.index = async (req, res, next) => {
  const response = req.query.response;
  const structured = response === "availability" || response === "preview";
  const action =
    response === "availability"
      ? "settings"
      : response === "preview"
        ? "preview"
        : req.query.action || "generate";
  const { pre, post } = req.query;
  const state = {
    title: "Reports",
    action,
    selected: { pre, post },
    report: null,
    availability: [],
    selectedFields: [],
    counts: null,
    inspected: false,
    error: null,
    errorCode: null,
    emptyMessage: null,
    settingsOpen: req.query.settingsOpen === "1",
    autoPrint: false,
    fragment: false,
  };
  if (pre && post) {
    if (typeof pre !== "string" || typeof post !== "string") {
      state.error = "Choose valid survey filenames.";
      state.errorCode = "invalid_files";
    } else {
      try {
        const comparison = await reportModel.build(pre, post);
        state.inspected = true;
        state.availability = comparison.availability;
        state.counts = {
          pre: comparison.preCount,
          post: comparison.postCount,
          matched: comparison.matched,
        };
        const requested =
          req.query.fields === undefined
            ? comparison.rows.map((r) => r.column)
            : Array.isArray(req.query.fields)
              ? req.query.fields
              : [req.query.fields];
        const validRequest = requested.every(
          (field) =>
            typeof field === "string" &&
            (field === "" || comparison.fields.includes(field)),
        );
        state.selectedFields = comparison.fields.filter((field) =>
          requested.includes(field),
        );
        if (!validRequest) {
          state.error =
            "Invalid report question selection. Choose questions available in the selected files.";
          state.errorCode = "invalid_fields";
        } else if (action !== "settings") {
          state.report = {
            ...comparison,
            rows: comparison.rows.filter((r) =>
              state.selectedFields.includes(r.column),
            ),
          };
          if (!comparison.preCount || !comparison.postCount) {
            state.emptyMessage =
              "One or both selected files contain no data records. Choose files with survey responses.";
          } else if (
            state.selectedFields.length === 0 &&
            req.query.fields !== undefined
          ) {
            state.error = "Select at least one question.";
            state.errorCode = "no_questions";
          } else if (
            !comparison.availability.some((f) => f.pre.kind || f.post.kind)
          ) {
            state.emptyMessage =
              "Both files were read, but no supported numeric or Yes/No questions were found.";
          } else if (!state.report.rows.length) {
            state.emptyMessage =
              "None of the selected questions can be compared in both surveys. Review their availability in Report Settings.";
          }
        }
      } catch (error) {
        console.error(error); // shows in Vercel logs if a file can't be read
        state.error =
          "Could not read those files. Make sure both are valid CSV files.";
        state.errorCode = "processing";
      }
    }
  } else if (pre || post || req.query.action || structured) {
    state.error = "Choose both a Pre-Survey and a Post-Survey file.";
    state.errorCode = "missing_files";
  }
  const selectedAvailability = state.availability.filter((f) =>
    state.selectedFields.includes(f.column),
  );
  state.unavailable = selectedAvailability.filter((f) => !f.comparable);
  state.readiness = {
    selected: selectedAvailability.length,
    ready: selectedAvailability.filter((f) => f.comparable).length,
  };
  state.noResults = Boolean(state.emptyMessage);
  state.settingsOpen =
    state.settingsOpen || Boolean(state.error && state.inspected);
  state.autoPrint =
    action === "generate" &&
    req.query.print === "1" &&
    Boolean(state.report && !state.error && !state.noResults);
  const metadata = {
    selected: state.selected,
    availability: state.availability,
    selectedFields: state.selectedFields,
    counts: state.counts,
    readiness: state.readiness,
    inspected: state.inspected,
    error: state.error,
    errorCode: state.errorCode,
  };
  if (structured) {
    const status = state.error
      ? state.errorCode === "processing"
        ? 422
        : 400
      : 200;
    if (response === "availability") return res.status(status).json(metadata);
    return res.render(
      "reports/index",
      { ...state, fragment: true },
      (error, html) => {
        if (error)
          return res
            .status(500)
            .json({
              error: "Could not prepare the report preview. Try again.",
            });
        res.status(status).json({ ...metadata, html });
      },
    );
  }
  try {
    const [preFiles, postFiles] = await Promise.all([
      reportModel.listCsvFiles("pre"),
      reportModel.listCsvFiles("post"),
    ]);
    res.render("reports/index", { ...state, preFiles, postFiles });
  } catch (err) {
    next(err);
  }
};
