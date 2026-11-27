// REPORT MODULE - Student growth (Joshua)
// For students who took both surveys: how many improved on each question.
const { growth, fmt } = require("../data");

module.exports = {
  id: "growth",
  title: "Student growth",
  description: "Of the students who took both surveys, how many improved on each question.",
  compute(data) {
    const items = data.questions.map((q) => ({ q, ...growth(data.pairs, q) })).filter((i) => i.n > 0);
    // Students who improved on at least half of the questions they answered both times
    let overall = 0;
    for (const p of data.pairs) {
      let up = 0, total = 0;
      for (const q of data.questions) {
        const g = growth([p], q);
        if (g.n) { total++; up += g.up; }
      }
      if (total && up / total >= 0.5) overall++;
    }
    return {
      items,
      overall: data.pairs.length ? (overall / data.pairs.length) * 100 : null,
      matched: data.pairs.length,
      table: {
        columns: ["Question", "Improved", "Stayed the same", "Declined", "% improved", "Students"],
        rows: items.map((i) => [i.q.label, i.up, i.same, i.down, fmt.pct(i.upPct), i.n]),
      },
    };
  },
};
