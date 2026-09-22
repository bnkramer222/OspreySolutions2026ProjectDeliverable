# Planned to A.T. Impact Platform — Osprey Solutions

Node.js + Express + EJS, organized as MVC.

## Run it
```
npm install
npm run dev
```
Open http://localhost:3000

## Structure
```
app.js          starts the server, connects the routes
models/         data         (M)
views/          EJS pages    (V)
controllers/    logic        (C)
routes/         URLs -> controller functions
public/         CSS / images
```

## Who owns what
| Module | Owner | Files |
|---|---|---|
| Account Management | Victoria | `*/account*` |
| File Management | Brandon | `*/file*`, `views/files/` |
| Dashboard | Jude | `*/dashboard*` |
| Report Generation | Joshua | `*/report*`, `views/reports/` |

## Adding a feature
1. Add a function to your **model**
2. Add a function to your **controller** that calls it and renders a view
3. Add a line to your **routes** file
4. Add/edit your **view**
