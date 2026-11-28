// REPORT MODULE - Key findings (Joshua)
// Plain-English sentences for grant applications and sponsor reports,
// written from the other modules' numbers.
const knowledge = require("./knowledge");
const behavior = require("./behavior");
const growth = require("./growth");
const { students, fmt } = require("../data");

module.exports = {
  id: "highlights",
  title: "Key findings",
  description: "Ready-to-use sentences for grant applications, sponsor reports and impact reports.",
  compute(data, opts) {
    const k = knowledge.compute(data, opts);
    const b = behavior.compute(data, opts);
    const g = growth.compute(data, opts);
    const lines = [];
    const reached = students([...data.pre, ...data.post, ...data.general]);
    const schools = new Set([...data.pre, ...data.post, ...data.general].map((r) => r.school).filter(Boolean)).size;
    if (reached) lines.push(`${fmt.int(reached)} students across ${schools} school${schools === 1 ? "" : "s"} and site${schools === 1 ? "" : "s"} took part, and ${fmt.int(data.pairs.length)} completed both the pre- and post-survey.`);
    // Only headline results that rest on enough students
    const enough = (i) => i.n >= Math.max(opts.minGroup, 10);
    const best = [...k.scales].filter((i) => i.change > 0 && enough(i)).sort((a, c) => c.pctChange - a.pctChange)[0];
    if (best) lines.push(`${best.q.label} rose from ${fmt.num(best.pre)} to ${fmt.num(best.post)} out of ${best.q.max_value || 5}, a ${fmt.pct(best.pctChange)} increase.`);
    const quiz = k.scores.find((i) => i.q.kind === "score" && i.change !== null && enough(i));
    if (quiz) lines.push(`Average ${quiz.q.label.replace(/ \(%\)$/, "").toLowerCase()} ${quiz.change >= 0 ? "improved" : "changed"} from ${fmt.pct(quiz.pre)} to ${fmt.pct(quiz.post)} (${fmt.signed(quiz.change, 0, " points")}).`);
    for (const i of [...b.items].filter((x) => x.change > 0 && enough(x)).sort((a, c) => c.change - a.change).slice(0, 2)) {
      const what = /^has /i.test(i.q.label) ? `who have ${i.q.label.slice(4).toLowerCase()}` : `answering yes to "${i.q.label}"`;
      lines.push(`The share of students ${what} grew from ${fmt.pct(i.pre)} to ${fmt.pct(i.post)}.`);
    }
    if (g.overall !== null && g.matched) lines.push(`${fmt.pct(g.overall)} of students who took both surveys improved on at least half of the questions.`);
    if (!lines.length) lines.push("Not enough matched pre- and post-survey data yet to write findings.");
    return {
      lines,
      basis: opts.matchedOnly ? "Based on students who took both surveys." : "Based on all survey responses.",
      table: { columns: ["Finding"], rows: lines.map((l) => [l]) },
    };
  },
};
