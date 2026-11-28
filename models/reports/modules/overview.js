// REPORT MODULE - Program reach (Joshua)
// Headline counts: how many students, schools and programs the data covers.
const { students, fmt } = require("../data");

module.exports = {
  id: "overview",
  title: "Program reach",
  description: "Students reached, surveys collected and how many students completed both surveys.",
  compute(data) {
    const all = [...data.pre, ...data.post, ...data.general];
    const reached = students(all);
    // Completion only counts pre-surveys where a post-survey was planned
    // Students are counted per program + cohort (the same ID can appear in two cohorts)
    const perCohort = (rows) => new Set(rows.map((r) => r.participant_id ? [r.participant_id, r.program || "", r.cohort || ""].join("|") : `row-${r.id}`)).size;
    const expecting = data.pre.filter((r) => r.expects_post !== false);
    const preN = perCohort(expecting);
    const matchedExpecting = data.pairs.filter((p) => p.expectsPost !== false).length;
    const completion = preN ? (matchedExpecting / preN) * 100 : null;
    const noPost = perCohort(data.pre) - preN;
    const programs = {};
    for (const r of all) {
      const p = (programs[r.program || "Not tagged"] = programs[r.program || "Not tagged"] || { pre: new Set(), post: new Set(), general: new Set(), schools: new Set() });
      p[r.survey_type].add(r.participant_id || `row-${r.id}`);
      if (r.school) p.schools.add(r.school);
    }
    const byProgram = Object.entries(programs).map(([program, p]) => ({ program, pre: p.pre.size, post: p.post.size, general: p.general.size, schools: p.schools.size }));
    return {
      tiles: [
        { label: "Students reached", value: fmt.int(reached), note: "took at least one survey" },
        { label: "Completed both surveys", value: fmt.int(data.pairs.length), note: completion === null ? "" : `${fmt.pct(completion)} of pre-survey students${noPost ? ` (${noPost} with no post-survey planned not counted)` : ""}` },
        { label: "Schools & sites", value: fmt.int(new Set(all.map((r) => r.school).filter(Boolean)).size), note: `${byProgram.length} program${byProgram.length === 1 ? "" : "s"}` },
        { label: "Surveys collected", value: fmt.int(all.length), note: `${fmt.int(data.pre.length)} pre · ${fmt.int(data.post.length)} post${data.general.length ? ` · ${fmt.int(data.general.length)} general` : ""}` },
      ],
      byProgram,
      table: {
        columns: ["Program", "Pre-survey students", "Post-survey students", "General-survey students", "Schools / sites"],
        rows: byProgram.map((p) => [p.program, p.pre, p.post, p.general, p.schools]),
      },
    };
  },
};
