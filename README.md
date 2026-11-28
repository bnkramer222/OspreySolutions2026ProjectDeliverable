# Planned to A.T. Impact Platform | Osprey Solutions

Turns Planned to A.T.'s messy pre- and post-survey spreadsheets into clean,
combined data and stakeholder-ready reports.

Node.js + Express + EJS + Postgres (Neon), organized as MVC, deployed on Vercel.

## Run it
```
npm install
cp .env.example .env      # then fill in DATABASE_URL and SESSION_SECRET
npm run dev
```
Open http://localhost:3000, create an account, and upload the files in
`sample-data/` (`messy_pre_fall2026.xlsx` as Pre, `messy_post_fall2026.xlsx` as Post).
Tables are created automatically on first start.

## How data flows
1. **Upload** a CSV or Excel (.xlsx) file to Pre-Survey or Post-Survey with its tags.
2. **Data scrubber** (`models/scrubber/`) reads it and cleans it:
   finds the real header row, drops name/email/phone columns, removes blank,
   title, total and duplicate rows, and standardizes Yes/No answers, 1–5 ratings,
   scores, grades, dates, IDs and school names.
   Optional free AI (Groq) only helps with unknown column names and spellings.
3. **Review**: the admin sees every change and approves (`views/files/review.ejs`).
4. **Saved** into `survey_responses` (pre and post in one table, kept apart by
   `survey_type`). Views: `pre_responses`, `post_responses`, `all_responses`,
   `matched_responses` (students who took both).
5. **Reports** (`models/reports/`) combine everything into aggregated sections.

## Structure
```
app.js              starts the server, connects the routes
db/                 Postgres connection + schema (database.js)
models/             data                       (M)
  scrubber/         cleans uploaded files
  reports/          report engine + one file per report section
views/              EJS pages                  (V)
controllers/        logic                      (C)
routes/             URLs -> controller functions
public/             style.css (brand colors) and images/
sample-data/        test files, including deliberately messy ones
```

## Who owns what
| Module | Owner | Files |
|---|---|---|
| Account Management | Victoria | `*/account*` |
| File Management + data scrubber | Brandon | `*/file*`, `models/scrubber/`, `models/surveyModel.js`, `views/files/` |
| Dashboard | Jude | `*/dashboard*` |
| Report Generation | Joshua | `*/report*`, `models/reports/`, `views/reports/` |

## Common changes
- **New report section:** add a file to `models/reports/modules/`, list it in
  `models/reports/index.js`, add `views/reports/modules/<id>.ejs`.
- **Teach the scrubber a column name:** add a pattern to `match` in
  `models/scrubber/fields.js`.
- **Brand colors:** the variables at the top of `public/style.css`.
- **Logo:** save `ptat-logo-white.png` and `ptat-logo-gray.png` in `public/images/`
  (until then, the logo loads from plannedtoat.org).

## Settings (environment variables)
See `.env.example`. On Vercel: Project → Settings → Environment Variables.
`GROQ_API_KEY` is optional. Get a free key at console.groq.com.

## Pre or post?
Uploads detect it automatically, checking in this order: a Pre/Post column
(each row sorted on its own), the file name ("lincoln_PRE.xlsx"), the sheet
name, the title row, then the AI. If nothing says, the review page asks, and
the file can't be imported until someone chooses.

## Sites
Not every session is at a school. "School / site" can be a high school,
university, seminar, community group or workplace. The site type is taken
from the upload form, a "Site type" column, or guessed from the name
("Money Moves Seminar" → Seminar / workshop). Different institutions are
never merged ("Peachtree State University" ≠ "Peachtree State College").
