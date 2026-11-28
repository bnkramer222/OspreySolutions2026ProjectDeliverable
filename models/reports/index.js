// ============================================================
// REPORTS - modular report engine (Joshua)
// A report = filters + a list of modules. Each module is one file in
// ./modules with: id, title, description, compute(data, options).
// Its page section is views/reports/modules/<id>.ejs (breakdowns share one).
// To add a module: write the file, add it to MODULES, add a view.
// ============================================================

const data = require("./data");

const MODULES = [
  require("./modules/overview"),
  require("./modules/highlights"),
  require("./modules/knowledge"),
  require("./modules/behavior"),
  require("./modules/growth"),
  require("./modules/general"),
  ...require("./modules/breakdown"),
];
const byId = Object.fromEntries(MODULES.map((m) => [m.id, m]));

// Ready-made reports for the most common requests
const TEMPLATES = [
  { id: "grant", title: "Grant application", description: "Reach, outcomes and key findings.", modules: ["overview", "highlights", "knowledge", "behavior", "growth"] },
  { id: "sponsor", title: "Sponsor update", description: "Short summary with results by school.", modules: ["overview", "highlights", "by_school"] },
  { id: "impact", title: "Full impact report", description: "Every section, including general surveys.", modules: MODULES.map((m) => m.id) },
  { id: "custom", title: "Custom", description: "Pick your own sections.", modules: null },
];

// filters: { program, school, cohort, year, grade, from, to }
// moduleIds: which sections, in this order
// options: { matchedOnly, minGroup }
async function build(filters, moduleIds, options) {
  const d = await data.load(filters);
  const sections = moduleIds
    .filter((id) => byId[id])
    .map((id) => {
      const m = byId[id];
      return { id, title: m.title, description: m.description, view: id.startsWith("by_") ? "breakdown" : id, ...m.compute(d, options) };
    });
  return { sections, counts: { pre: d.pre.length, post: d.post.length, general: d.general.length, pairs: d.pairs.length } };
}

// The report's sections as one CSV file (for Excel)
function toCsv(report, meta) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [[meta.title], [meta.filterText], [`Generated ${new Date().toISOString().slice(0, 10)}`], []];
  for (const s of report.sections) {
    lines.push([s.title], s.table.columns, ...s.table.rows, []);
  }
  return "﻿" + lines.map((l) => l.map(esc).join(",")).join("\r\n");
}

module.exports = { MODULES, TEMPLATES, FILTERS: data.FILTERS, filterOptions: data.filterOptions, build, toCsv, fmt: data.fmt };
