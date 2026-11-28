// CONTROLLER - Report Generation (Joshua)
// GET /reports            -> report builder with a live preview
// GET /reports/export.csv -> the same report as a CSV file for Excel
// Everything is in the URL, so a report can be bookmarked or shared
// with another staff member and opens the same way.
const reports = require("../models/reports");
const surveyModel = require("../models/surveyModel");

const FILTER_KEYS = ["program", "siteType", "school", "cohort", "year", "grade", "from", "to", "surveys"];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Turns the query string into a clean report request
function readRequest(query) {
  const template = reports.TEMPLATES.find((t) => t.id === query.template) || reports.TEMPLATES[0];
  let modules = [].concat(query.modules || []).filter((m) => reports.MODULES.some((x) => x.id === m));
  if (template.modules && !query.edited) modules = template.modules;
  if (!modules.length) modules = ["overview"];
  const filters = {};
  for (const k of FILTER_KEYS) {
    const v = typeof query[k] === "string" ? query[k].trim() : "";
    if (k === "surveys") { if (["prepost", "general"].includes(v)) filters[k] = v; continue; }
    if (v && ((k !== "from" && k !== "to") || isDate(v))) filters[k] = v;
  }
  const minGroup = [1, 5, 10].includes(Number(query.minGroup)) ? Number(query.minGroup) : 5;
  return {
    template,
    modules,
    filters,
    options: { matchedOnly: query.matched !== "0", minGroup },
    title: (query.title || "").trim().slice(0, 120) || `${template.id === "custom" ? "Impact" : template.title} report`,
  };
}

const filterText = (filters) => {
  const parts = reports.FILTERS.filter((f) => filters[f.key]).map((f) => (f.key === "grade" ? `Grade ${filters[f.key]}` : filters[f.key]));
  if (filters.from || filters.to) parts.push(`Surveys ${filters.from || "…"} to ${filters.to || "…"}`);
  if (filters.surveys === "prepost") parts.push("Pre/post surveys only");
  if (filters.surveys === "general") parts.push("General surveys only");
  return parts.length ? parts.join(" · ") : "All programs, schools and cohorts";
};

exports.index = async (req, res, next) => {
  try {
    const request = readRequest(req.query);
    const [report, options] = await Promise.all([
      reports.build(request.filters, request.modules, request.options),
      reports.filterOptions(),
    ]);
    const exportQuery = new URLSearchParams(req.query).toString();
    res.render("reports/index", {
      title: "Reports",
      request,
      report,
      filterDefs: reports.FILTERS,
      filterOptions: options,
      templates: reports.TEMPLATES,
      modules: reports.MODULES,
      filterText: filterText(request.filters),
      exportUrl: `/reports/export.csv${exportQuery ? "?" + exportQuery : ""}`,
      fmt: reports.fmt,
      generated: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    });
  } catch (err) {
    next(err);
  }
};

exports.exportCsv = async (req, res, next) => {
  try {
    const request = readRequest(req.query);
    const report = await reports.build(request.filters, request.modules, request.options);
    const csv = reports.toCsv(report, { title: request.title, filterText: filterText(request.filters) });
    const name = request.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "report";
    res.attachment(`${name}.csv`).type("text/csv").send(csv);
  } catch (err) {
    next(err);
  }
};

// GET /reports/questions -> rename questions, set topics, hide from reports
exports.questions = async (req, res, next) => {
  try {
    res.render("reports/questions", {
      title: "Questions",
      questions: await surveyModel.questions(),
      success: req.query.success || null,
    });
  } catch (err) {
    next(err);
  }
};

// POST /reports/questions -> save every row of the form
exports.saveQuestions = async (req, res, next) => {
  try {
    const keys = [].concat(req.body.key || []);
    for (let i = 0; i < keys.length; i++)
      await surveyModel.updateQuestion(keys[i], {
        label: req.body[`label_${i}`],
        topic: req.body[`topic_${i}`],
        hidden: req.body[`hidden_${i}`] === "1",
      });
    res.redirect("/reports/questions?success=" + encodeURIComponent("Saved. Reports now use these names."));
  } catch (err) {
    next(err);
  }
};
