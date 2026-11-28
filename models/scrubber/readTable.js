// ============================================================
// SCRUBBER - reads a CSV or Excel file into a grid of cells (Brandon)
// Returns { sheetName, grid } where grid is an array of rows and each
// row is an array of cell values (strings, numbers or Dates).
// Handles: Excel sheets, merged cells, formulas, rich text, CSVs saved
// with ; or tabs instead of commas, and the hidden BOM at the start of
// files saved by Excel.
// ============================================================

const path = require("path");
const { parse } = require("csv-parse/sync");
const ExcelJS = require("exceljs");

function readCsv(buffer) {
  const textContent = buffer.toString("utf8");
  const firstLines = textContent.split(/\r?\n/).slice(0, 10).join("\n");
  // Pick the separator that appears most: , ; or tab
  const delimiter = [",", ";", "\t"].sort(
    (a, b) => firstLines.split(b).length - firstLines.split(a).length,
  )[0];
  return parse(textContent, {
    delimiter,
    bom: true,
    relax_column_count: true, // rows with extra/missing cells don't crash
    relax_quotes: true,
    skip_empty_lines: false,
  });
}

// Excel cell -> plain value
function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? ""; // formula
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text; // hyperlink
    if (v.error) return "";
  }
  return v;
}

async function readExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  // Use the sheet with the most filled-in cells (skips cover/instructions tabs)
  let best = null;
  workbook.eachSheet((sheet) => {
    let filled = 0;
    sheet.eachRow((row) => row.eachCell(() => filled++));
    if (!best || filled > best.filled) best = { sheet, filled };
  });
  if (!best) return { sheetName: null, grid: [] };

  const { sheet } = best;
  const grid = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      // Merged cells: copy the value from the top-left cell of the merge
      cells.push(cellValue(cell.isMerged ? cell.master : cell));
    }
    grid[rowNumber - 1] = cells;
  });
  return { sheetName: sheet.name, grid: Array.from(grid, (r) => r || []) };
}

async function readTable(buffer, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".csv" || ext === ".txt") return { sheetName: null, grid: readCsv(buffer) };
  if (ext === ".xlsx") return readExcel(buffer);
  if (ext === ".xls")
    throw new Error("Old .xls files can't be read. In Excel, choose File → Save As → Excel Workbook (.xlsx) and upload that.");
  throw new Error("Only CSV and Excel (.xlsx) files can be imported.");
}

module.exports = readTable;
