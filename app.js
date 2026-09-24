const express = require("express");
const path = require("path");
const session = require("express-session");


const app = express();

const authRoutes = require("./routes/authRoutes");

app.use(session({
    secret: "planned-to-at-secret",
    resave: false,
    saveUninitialized: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRoutes);
app.use("/account", require("./routes/accountRoutes"));
app.use("/files", require("./routes/fileRoutes"));
app.use("/dashboard", require("./routes/dashboardRoutes"));
app.use("/reports", require("./routes/reportRoutes"));


app.get("/", (req, res) => {
    res.redirect("/auth/login");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Running at http://localhost:${PORT}`);
});