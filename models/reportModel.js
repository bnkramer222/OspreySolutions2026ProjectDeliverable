// MODEL - Report Generation (Joshua)
// Reads the CSV files uploaded in the Pre and Post sections and compares them.
// The CSVs are stored in the database (see fileModel.getFile).
// listCsvFiles() and build() are async: call them with "await".
const { parse } = require("csv-parse/sync");
const fileModel = require("./fileModel");

// Columns that describe the participant, not survey answers
const INFO_COLUMNS = [
  "participant_id",
  "program",
  "school",
  "location",
  "grade_level",
  "cohort",
  "survey_date",
];

// Retain headers even when a readable CSV contains no data records.
async function readCsv(type, name) {
  const file = await fileModel.getFile(type, name);
  if (!file || !file.content) {
    throw new Error(`File not found: ${type}/${name}`);
  }
  let columns = [];
  const rows = parse(file.content, {
    columns: (names) => {
      columns = names;
      return names;
    },
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
  return { rows, columns };
}

// Numbers -> average, Yes/No -> % Yes, anything else -> skipped
function summarize(values) {
  if (values.length === 0) return null;

  if (values.every((v) => !isNaN(Number(v)))) {
    const nums = values.map(Number);
    const total = nums.reduce((sum, v) => sum + v, 0);
    return {
      kind: "average",
      value: total / nums.length,
      max: Math.max(...nums),
    };
  }
  if (values.every((v) => /^(yes|no)$/i.test(v))) {
    const yes = values.filter((v) => /^yes$/i.test(v)).length;
    return { kind: "percent", value: (yes / values.length) * 100, max: 100 };
  }
  return null;
}

// Preserve the existing all-nonblank-answers rule: a mixed unsupported
// column produces no summary, rather than silently dropping invalid answers.
function inspectColumn(file, column) {
  const exists = file.columns.includes(column);
  const values = file.rows
    .map((r) => r[column])
    .filter((value) => value !== undefined && value !== "");
  const answerCount = values.length;
  const summary = exists ? summarize(values) : null;
  return {
    summary,
    metadata: {
      exists,
      kind: summary ? summary.kind : null,
      answerCount,
      usableCount: summary ? answerCount : 0,
    },
  };
}

module.exports = {
  async listCsvFiles(type) {
    const files = await fileModel.getAll(type);
    return files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
  },
  async build(preName, postName) {
    const [pre, post] = await Promise.all([
      readCsv("pre", preName),
      readCsv("post", postName),
    ]);
    const fields = [...new Set([...pre.columns, ...post.columns])].filter(
      (c) => c !== "" && !INFO_COLUMNS.includes(c),
    );
    const availability = [];
    const rows = [];
    fields.forEach((column) => {
      const before = inspectColumn(pre, column);
      const after = inspectColumn(post, column);
      const reasons = [];
      for (const [side, info] of [
        ["pre", before.metadata],
        ["post", after.metadata],
      ]) {
        if (!info.exists) reasons.push(`Missing from ${side}-survey.`);
        else if (info.answerCount === 0)
          reasons.push(`No usable ${side}-survey answers.`);
        else if (!info.kind)
          reasons.push(`Unsupported ${side}-survey answer type.`);
      }
      if (
        before.summary &&
        after.summary &&
        before.summary.kind !== after.summary.kind
      ) {
        reasons.push("Pre/post answer types do not match.");
      }
      const comparable = reasons.length === 0;
      availability.push({
        column,
        pre: before.metadata,
        post: after.metadata,
        comparable,
        reasons,
        reason: reasons.join(" "),
      });
      if (comparable) {
        rows.push({
          column,
          kind: before.summary.kind,
          pre: before.summary.value,
          post: after.summary.value,
          change: after.summary.value - before.summary.value,
          scale: Math.max(before.summary.max, after.summary.max),
        });
      }
    });
    const preIds = new Set(pre.rows.map((r) => r.participant_id));
    const matched = post.rows.filter((r) =>
      preIds.has(r.participant_id),
    ).length;
    return {
      preName,
      postName,
      preCount: pre.rows.length,
      postCount: post.rows.length,
      matched,
      fields,
      availability,
      rows,
    };
  },
};
