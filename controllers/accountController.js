// CONTROLLER - Account Management (Victoria)
// Model calls hit the database, so they're async: every one uses "await".
// Errors are passed to next(err), which shows the error page from app.js.
const accountModel = require("../models/accountModel");

// Saves the session to the database BEFORE redirecting, so the next
// page already sees the user as logged in.
const saveAndRedirect = (req, res, next, url) =>
  req.session.save((err) => (err ? next(err) : res.redirect(url)));

// GET /account - who's logged in + all admin accounts
exports.index = async (req, res, next) => {
  try {
    res.render("account/index", {
      title: "Account",
      accounts: await accountModel.getAll(),
    });
  } catch (err) {
    next(err);
  }
};

// GET /account/login
exports.showLogin = (req, res) => {
  res.render("account/login", { title: "Log In", error: null, email: "" });
};

// POST /account/login
exports.login = async (req, res, next) => {
  try {
    const { email = "", password = "" } = req.body;
    const user = await accountModel.checkLogin(email, password);

    if (!user) {
      return res.render("account/login", {
        title: "Log In",
        error: "Wrong email or password.",
        email,
      });
    }

    req.session.user = user; // remembered until logout
    saveAndRedirect(req, res, next, "/dashboard");
  } catch (err) {
    next(err);
  }
};

// GET /account/register
exports.showRegister = (req, res) => {
  res.render("account/register", {
    title: "Create Account",
    error: null,
    name: "",
    email: "",
  });
};

// POST /account/register
exports.register = async (req, res, next) => {
  const { name = "", email = "", password = "" } = req.body;
  const showError = (error) =>
    res.render("account/register", {
      title: "Create Account",
      error,
      name,
      email,
    });

  try {
    if (!name.trim() || !email.trim())
      return showError("Name and email are required.");
    if (password.length < 8)
      return showError("Password must be at least 8 characters.");
    if (await accountModel.findByEmail(email))
      return showError("An account with that email already exists.");

    req.session.user = await accountModel.create({ name, email, password }); // log them in right away
    saveAndRedirect(req, res, next, "/dashboard");
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the database blocks the second one
    if (err.code === "23505")
      return showError("An account with that email already exists.");
    next(err);
  }
};

// POST /account/logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/account/login"));
};
