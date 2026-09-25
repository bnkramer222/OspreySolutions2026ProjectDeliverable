const express = require("express");
const path = require("path");
const session = require("express-session");
const requireAuth = require("./middleware/requireAuth");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Remembers who is logged in (lasts 8 hours)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 },
  }),
);

// Makes the logged-in user available in every view as "user"
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Each module has its own routes file
app.use("/account", require("./routes/accountRoutes"));
app.use("/files", requireAuth, require("./routes/fileRoutes"));
app.use("/dashboard", requireAuth, require("./routes/dashboardRoutes"));
app.use("/reports", requireAuth, require("./routes/reportRoutes"));

app.get("/", (req, res) => res.redirect("/dashboard"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
