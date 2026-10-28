const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const ejs = require("ejs");
const reportModel = require("../models/reportModel");
const reportController = require("../controllers/reportController");
const fileModel = require("../models/fileModel");
const view = path.join(__dirname, "..", "views", "reports", "index.ejs");
const noResultsMessage = "No report data matches your current selections. Choose different files or change the report settings and try again.";
const selected = { pre: "pre.csv", post: "post.csv" };
const populatedReport = {
  preName: selected.pre,
  postName: selected.post,
  preCount: 2,
  postCount: 3,
  matched: 1,
  rows: [
    { column: "quiz_score", kind: "average", pre: 3, post: 7, change: 4, scale: 8 },
    { column: "feels_ready", kind: "percent", pre: 50, post: 100, change: 50, scale: 100 },
  ],
};

function render(overrides = {}) {
  return ejs.renderFile(view, {
    title: "Reports",
    user: { name: "Report Test Admin" },
    preFiles: [{ name: selected.pre }],
    postFiles: [{ name: selected.post }],
    selected,
    report: null,
    noResults: false,
    error: null,
    ...overrides,
  });
}

function assertSelections(html, pre = selected.pre, post = selected.post) {
  assert.ok(html.includes('value="' + pre + '" selected'));
  assert.ok(html.includes('value="' + post + '" selected'));
}

function fixturePair(t, preText, postText) {
  const id = randomUUID();
  const names = { pre: "report-test-" + id + "-pre.csv", post: "report-test-" + id + "-post.csv" };
  const paths = [];
  t.after(() => paths.forEach((file) => fs.rmSync(file, { force: true })));
  for (const [type, text] of [["pre", preText], ["post", postText]]) {
    const file = fileModel.getPath(type, names[type]);
    fs.writeFileSync(file, text, { flag: "wx" });
    paths.push(file);
  }
  return names;
}

function controllerState(query = {}) {
  let state;
  reportController.index({ query }, {
    render(name, locals) {
      assert.equal(name, "reports/index");
      state = locals;
    },
  });
  return state;
}

test("populated preview keeps summaries, comparisons, recovery link, and selections", async () => {
  const html = await render({ report: populatedReport });
  assert.match(html, /Report Preview/);
  assert.match(html, /Review the report information before continuing\./);
  assert.match(html, /href="#report-settings">Change Report Settings/);
  assert.match(html, /id="report-settings"[^>]*tabindex="-1"/);
  for (const label of ["Pre responses", "Post responses", "Took both surveys", "quiz score", "feels ready", "3.00", "7.00", "50% Yes", "100% Yes", "+4.00", "+50 pts"]) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /Numbers are averages; Yes\/No questions show the percent who answered Yes\./);
  assertSelections(html);
  assert.ok(!html.includes(noResultsMessage));
});

test("no results is an accessible actionable state without empty comparison UI", async () => {
  const html = await render({ report: { ...populatedReport, rows: [] }, noResults: true });
  assert.ok(html.includes(noResultsMessage));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /href="#report-settings">Change Report Settings/);
  assertSelections(html);
  assert.doesNotMatch(html, /Report Preview|Pre vs\. Post|class="(?:stats|legend|question|bar-row)"/);
});

test("read failures remain errors without preview or no-results messaging", async () => {
  const error = "Could not read those files. Make sure both are valid CSV files.";
  const html = await render({ error });
  assert.ok(html.includes(error));
  assert.match(html, /role="alert"/);
  assertSelections(html);
  assert.ok(!html.includes(noResultsMessage));
  assert.doesNotMatch(html, /Report Preview|role="status"/);
});

test("initial setup and the existing no-uploaded-files notice still render", async () => {
  const html = await render({ preFiles: [], postFiles: [], selected: {} });
  assert.match(html, /Upload a CSV in both the/);
  assert.match(html, /href="\/files\/pre"/);
  assert.match(html, /href="\/files\/post"/);
  assert.doesNotMatch(html, /Report Preview|role="status"/);
});

test("uploaded question names and filenames stay escaped", async () => {
  const name = '<img src=x onerror=alert(1)>.csv';
  const html = await render({
    preFiles: [{ name }], postFiles: [{ name }], selected: { pre: name, post: name },
    report: { ...populatedReport, rows: [{ ...populatedReport.rows[0], column: '<script>alert(1)</script>' }] },
  });
  assert.doesNotMatch(html, /<img src=x|<script>alert/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal((html.match(/ selected/g) || []).length, 2);
});

test("model preserves group averages, percent Yes, changes, and overlap counts", (t) => {
  const names = fixturePair(t,
    "participant_id,quiz_score,feels_ready\nP1,2,Yes\nP2,4,No\n",
    "participant_id,quiz_score,feels_ready\nP2,6,Yes\nP3,8,Yes\n");
  const report = reportModel.build(names.pre, names.post);
  assert.deepEqual(report.rows, populatedReport.rows);
  assert.equal(report.preCount, 2);
  assert.equal(report.postCount, 2);
  assert.equal(report.matched, 1);
});

for (const [label, pre, post] of [
  ["unsupported text-only answers", "participant_id,comment\nP1,Hello\n", "participant_id,comment\nP1,World\n"],
  ["nonshared numeric questions", "participant_id,pre_only\nP1,2\n", "participant_id,post_only\nP1,4\n"],
  ["readable files without response records", "participant_id,score\n", "participant_id,score\n"],
]) {
  test("model yields no report rows for " + label, (t) => {
    const names = fixturePair(t, pre, post);
    assert.deepEqual(reportModel.build(names.pre, names.post).rows, []);
  });
}

test("controller distinguishes initial, populated, empty, and error states", (t) => {
  const initial = controllerState();
  assert.equal(initial.report, null);
  assert.equal(initial.noResults, false);
  assert.equal(initial.error, null);
  const valid = fixturePair(t, "participant_id,score\nP1,2\n", "participant_id,score\nP1,4\n");
  const populated = controllerState(valid);
  assert.equal(populated.noResults, false);
  assert.equal(populated.report.rows.length, 1);
  assert.deepEqual(populated.selected, valid);
  const textOnly = fixturePair(t, "participant_id,comment\nP1,Hello\n", "participant_id,comment\nP1,World\n");
  const empty = controllerState(textOnly);
  assert.equal(empty.noResults, true);
  assert.equal(empty.error, null);
  assert.deepEqual(empty.selected, textOnly);
  const unreadable = controllerState({ pre: valid.pre, post: "missing-" + randomUUID() + ".csv" });
  assert.equal(unreadable.report, null);
  assert.equal(unreadable.noResults, false);
  assert.equal(unreadable.error, "Could not read those files. Make sure both are valid CSV files.");
  assert.equal(unreadable.selected.pre, valid.pre);
});
