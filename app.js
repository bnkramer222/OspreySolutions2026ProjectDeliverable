// Load .env when running locally (Vercel sets the variables itself)
try {
  process.loadEnvFile();
} catch {}

const express = require("express");
const path = require("path");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const pool = require("./db/pool");
const requireAuth = require("./middleware/requireAuth");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1); // Vercel sits in front of the app; needed for secure cookies
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Remembers who is logged in (lasts 8 hours).
// Sessions are stored in Postgres so they survive across Vercel's server copies.
app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

// Makes the logged-in user available in every view as "user",
// and which menu item to highlight as "section" (dashboard, files, reports...)
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.section = req.path.split("/")[1] || "dashboard";
  next();
});

// Each module has its own routes file
app.use("/account", require("./routes/accountRoutes"));
app.use("/files", requireAuth, require("./routes/fileRoutes"));
app.use("/dashboard", requireAuth, require("./routes/dashboardRoutes"));
app.use("/reports", requireAuth, require("./routes/reportRoutes"));

app.get("/", (req, res) => res.redirect("/dashboard"));

// Shows a readable error instead of crashing when a database call fails
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong. Check the server logs.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));

module.exports = app;
