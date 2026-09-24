// MODEL - Report Generation (Joshua)
// Reads the CSV files uploaded in the Pre and Post sections and compares them.
const fs = require("fs");
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

// Read a CSV into rows like { participant_id: 'P001', quiz_score_out_of_10: '4', ... }
function readCsv(type, name) {
  const text = fs.readFileSync(fileModel.getPath(type, name));
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });
}

// Numbers -> average, Yes/No -> % Yes, anything else -> skipped
function summarize(rows, column) {
  const values = rows
    .map((r) => r[column])
    .filter((v) => v !== undefined && v !== "");
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

module.exports = {
  // CSV files in a section (Excel isn't supported yet)
  listCsvFiles(type) {
    return fileModel
      .getAll(type)
      .filter((f) => f.name.toLowerCase().endsWith(".csv"));
  },

  // Compare one pre file with one post file
  build(preName, postName) {
    const pre = readCsv("pre", preName);
    const post = readCsv("post", postName);

    // Survey questions = columns in both files that aren't participant info
    const postColumns = Object.keys(post[0] || {});
    const questions = Object.keys(pre[0] || {}).filter(
      (c) => !INFO_COLUMNS.includes(c) && postColumns.includes(c),
    );

    const rows = questions
      .map((column) => {
        const before = summarize(pre, column);
        const after = summarize(post, column);
        if (!before || !after || before.kind !== after.kind) return null;
        return {
          column,
          kind: before.kind,
          pre: before.value,
          post: after.value,
          change: after.value - before.value,
          scale: Math.max(before.max, after.max), // longest bar = highest value seen
        };
      })
      .filter(Boolean);

    // Participants who took both surveys
    const preIds = new Set(pre.map((r) => r.participant_id));
    const matched = post.filter((r) => preIds.has(r.participant_id)).length;

    return {
      preName,
      postName,
      preCount: pre.length,
      postCount: post.length,
      matched,
      rows,
    };
  },
};
