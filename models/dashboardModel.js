// MODEL - Dashboard (Jude)
// Reads live numbers from the survey database (see models/surveyModel.js).
// All functions are async: call them with "await".
const surveyModel = require("./surveyModel");
const reports = require("./reports");

module.exports = {
  // Headline numbers + recent imports for the main dashboard
  async summary() {
    const [overview, recent, report] = await Promise.all([
      surveyModel.overview(),
      surveyModel.recentImports(6),
      reports.build({}, ["knowledge", "behavior"], { matchedOnly: true, minGroup: 5 }),
    ]);
    const [knowledge, behavior] = report.sections;
    return { overview, recent, knowledge, behavior };
  },

  // Schools with their pre/post counts, optionally only one state
  async getSchools(state) {
    const rows = await surveyModel.schools();
    const withState = rows.map((r) => ({ ...r, state: ((r.location || "").match(/,\s*([A-Z]{2})\b/) || [])[1] || "" }));
    return {
      states: [...new Set(withState.map((r) => r.state).filter(Boolean))].sort(),
      schools: state ? withState.filter((r) => r.state === state) : withState,
    };
  },

  // Individual survey responses, filtered and paged
  getRecords: (query) => surveyModel.responses(query),
};
