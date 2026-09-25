// CONTROLLER - Account Management (Victoria)
const accountModel = require("../models/accountModel");

// GET /account - who's logged in + all admin accounts
exports.index = (req, res) => {
  res.render("account/index", {
    title: "Account",
    accounts: accountModel.getAll(),
  });
};

// GET /account/login
exports.showLogin = (req, res) => {
  res.render("account/login", { title: "Log In", error: null, email: "" });
};

// POST /account/login
exports.login = (req, res) => {
  const { email = "", password = "" } = req.body;
  const user = accountModel.checkLogin(email, password);

  if (!user) {
    return res.render("account/login", {
      title: "Log In",
      error: "Wrong email or password.",
      email,
    });
  }

  req.session.user = user; // remembered until logout
  res.redirect("/dashboard");
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
exports.register = (req, res) => {
  const { name = "", email = "", password = "" } = req.body;
  const showError = (error) =>
    res.render("account/register", {
      title: "Create Account",
      error,
      name,
      email,
    });

  if (!name.trim() || !email.trim())
    return showError("Name and email are required.");
  if (password.length < 8)
    return showError("Password must be at least 8 characters.");
  if (accountModel.findByEmail(email))
    return showError("An account with that email already exists.");

  req.session.user = accountModel.create({ name, email, password }); // log them in right away
  res.redirect("/dashboard");
};

// POST /account/logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/account/login"));
};
