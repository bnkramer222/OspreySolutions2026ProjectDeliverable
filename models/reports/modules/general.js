// REPORT MODULE - General survey results (Joshua)
// One-off surveys (event feedback, check-ins...) aren't before/after,
// so they're summarized on their own: average rating, average score or
// % yes for each question, and how many students answered.
const { avg, nums, pctYes, students, fmt } = require("../data");

module.exports = {
  id: "general",
  title: "General survey results",
  description: "One-off surveys (event feedback, check-ins) that aren't part of a before/after pair.",
  compute(data) {
    const answers = data.general.map((r) => r.answers);
    const items = data.questions
      .map((q) => {
        const n = answers.filter((a) => a[q.key] !== undefined && a[q.key] !== null).length;
        const value = q.kind === "yesno" ? pctYes(answers, q.key) : avg(nums(answers, q.key));
        return { q, n, value };
      })
      .filter((i) => i.n > 0);
    return {
      students: students(data.general),
      responses: data.general.length,
      sites: new Set(data.general.map((r) => r.school).filter(Boolean)).size,
      scales: items.filter((i) => i.q.kind === "scale"),
      percents: items.filter((i) => i.q.kind !== "scale"),
      table: {
        columns: ["Question", "Result", "Students answering"],
        rows: items.map((i) => [i.q.label, i.q.kind === "yesno" ? `${fmt.pct(i.value)} yes` : i.q.kind === "scale" ? `${fmt.num(i.value)} / ${i.q.max_value || 5}` : fmt.value(i.q, i.value), i.n]),
      },
    };
  },
};
