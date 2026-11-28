// REPORT MODULE - Program reach (Joshua)
// Headline counts: how many students, schools and programs the data covers.
const { students, fmt } = require("../data");

module.exports = {
  id: "overview",
  title: "Program reach",
  description: "Students reached, surveys collected and how many students completed both surveys.",
  compute(data) {
    const all = [...data.pre, ...data.post];
    const reached = students(all);
    const preN = students(data.pre);
    const completion = preN ? (data.pairs.length / preN) * 100 : null;
    const programs = {};
    for (const r of all) {
      const p = (programs[r.program || "Not tagged"] = programs[r.program || "Not tagged"] || { pre: new Set(), post: new Set(), schools: new Set() });
      p[r.survey_type].add(r.participant_id || `row-${r.id}`);
      if (r.school) p.schools.add(r.school);
    }
    const byProgram = Object.entries(programs).map(([program, p]) => ({ program, pre: p.pre.size, post: p.post.size, schools: p.schools.size }));
    return {
      tiles: [
        { label: "Students reached", value: fmt.int(reached), note: "took at least one survey" },
        { label: "Completed both surveys", value: fmt.int(data.pairs.length), note: completion === null ? "" : `${fmt.pct(completion)} of pre-survey students` },
        { label: "Schools & sites", value: fmt.int(new Set(all.map((r) => r.school).filter(Boolean)).size), note: `${byProgram.length} program${byProgram.length === 1 ? "" : "s"}` },
        { label: "Surveys collected", value: fmt.int(all.length), note: `${fmt.int(data.pre.length)} pre · ${fmt.int(data.post.length)} post` },
      ],
      byProgram,
      table: {
        columns: ["Program", "Pre-survey students", "Post-survey students", "Schools"],
        rows: byProgram.map((p) => [p.program, p.pre, p.post, p.schools]),
      },
    };
  },
};
