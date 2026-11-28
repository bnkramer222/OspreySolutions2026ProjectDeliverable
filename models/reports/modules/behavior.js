// REPORT MODULE - Financial behaviors (Joshua)
// % of students answering Yes (has a budget, has a savings account...) before vs after.
const { compare, fmt } = require("../data");

module.exports = {
  id: "behavior",
  title: "Financial behaviors",
  description: "Share of students who say they budget, save or bank, before and after.",
  compute(data, opts) {
    const items = data.questions
      .filter((q) => q.kind === "yesno")
      .map((q) => ({ q, ...compare(data, q, opts.matchedOnly) }))
      .filter((i) => i.pre !== null || i.post !== null);
    return {
      items,
      table: {
        columns: ["Behavior", "Pre (% yes)", "Post (% yes)", "Change (points)", "Students"],
        rows: items.map((i) => [i.q.label, fmt.pct(i.pre), fmt.pct(i.post), fmt.signed(i.change, 0, " pts"), i.n]),
      },
    };
  },
};
