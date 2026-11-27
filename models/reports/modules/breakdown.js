// REPORT MODULES - Results by school / program / grade / cohort (Joshua)
// One factory makes four modules. To add "by location", add one line at the bottom.
// Groups with fewer students than the privacy minimum are hidden,
// so a small class can't be identified.
const { compare, students, avg, fmt } = require("../data");

function make(id, dim, title, noun) {
  return {
    id,
    title,
    description: `Students, completion and average gains for each ${noun}.`,
    compute(data, opts) {
      const groups = {};
      const add = (k) => (groups[k] = groups[k] || { pre: [], post: [], pairs: [] });
      data.pre.forEach((r) => add(r[dim] || "Not tagged").pre.push(r));
      data.post.forEach((r) => add(r[dim] || "Not tagged").post.push(r));
      data.pairs.forEach((p) => add(p[dim] || "Not tagged").pairs.push(p));
      const scales = data.questions.filter((q) => q.kind === "scale");
      const quiz = data.questions.find((q) => q.kind === "score");
      const yesno = data.questions.filter((q) => q.kind === "yesno");
      const rows = Object.entries(groups).map(([name, g]) => {
        const sub = { ...data, pre: g.pre, post: g.post, pairs: g.pairs };
        const n = Math.max(students(g.pre), students(g.post));
        const conf = avg(scales.map((q) => compare(sub, q, opts.matchedOnly).change).filter((v) => v !== null));
        const quizGain = quiz ? compare(sub, quiz, opts.matchedOnly).change : null;
        const behavior = avg(yesno.map((q) => compare(sub, q, opts.matchedOnly).change).filter((v) => v !== null));
        return { name, n, pre: students(g.pre), post: students(g.post), matched: g.pairs.length, conf, quizGain, behavior, hidden: n < opts.minGroup };
      });
      const order = dim === "grade_level" ? (a, b) => (Number(a.name) || 99) - (Number(b.name) || 99) : (a, b) => b.n - a.n;
      rows.sort(order);
      const shown = rows.filter((r) => !r.hidden);
      return {
        noun,
        rows,
        hiddenCount: rows.length - shown.length,
        hasQuiz: Boolean(quiz),
        table: {
          columns: [title.replace("Results by ", ""), "Pre students", "Post students", "Both surveys", "Avg. rating change (1-5)", "Quiz change (pts)", "Behavior change (pts)"],
          rows: shown.map((r) => [r.name, r.pre, r.post, r.matched, fmt.signed(r.conf, 2), fmt.signed(r.quizGain, 0), fmt.signed(r.behavior, 0)]),
        },
      };
    },
  };
}

module.exports = [
  make("by_school", "school", "Results by school", "school or university"),
  make("by_program", "program", "Results by program", "program"),
  make("by_grade", "grade_level", "Results by grade", "grade level"),
  make("by_cohort", "cohort", "Results by cohort", "cohort"),
];
