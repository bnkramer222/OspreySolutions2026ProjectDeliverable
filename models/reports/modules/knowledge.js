// REPORT MODULE - Knowledge & confidence gains (Joshua)
// Average pre vs post for every rating (1-5) and score question.
const { compare, fmt } = require("../data");

module.exports = {
  id: "knowledge",
  title: "Knowledge & confidence gains",
  description: "Average ratings and quiz scores before and after the program.",
  compute(data, opts) {
    const items = data.questions
      .filter((q) => q.kind === "scale" || q.kind === "score" || q.kind === "number")
      .map((q) => ({ q, ...compare(data, q, opts.matchedOnly) }))
      .filter((i) => i.pre !== null || i.post !== null);
    const scales = items.filter((i) => i.q.kind === "scale");
    const scores = items.filter((i) => i.q.kind !== "scale");
    const row = (i) => [i.q.label, fmt.value(i.q, i.pre), fmt.value(i.q, i.post), fmt.signed(i.change, 1, i.q.kind === "scale" ? "" : " pts"), i.pctChange == null ? "—" : fmt.signed(i.pctChange, 0, "%"), i.n];
    return {
      scales,
      scores,
      table: { columns: ["Question", "Pre", "Post", "Change", "% change", "Students"], rows: items.map(row) },
    };
  },
};
