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
  res.render("account/login", { title: "Log In", error: null, email: "", notice: req.query.notice || null });
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
    firstName: "",
    lastName: "",
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
      firstName,
      lastName,
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

// Profile actions
exports.changePassword = (req, res) => {
  const { currentPassword = "", newPassword = "", confirmPassword = "" } = req.body;
  const id = req.session.user.id;
  if (!accountModel.verifyPassword(id, currentPassword))
    return res.redirect("/account?error=" + encodeURIComponent("Current password is incorrect."));
  if (newPassword.length < 8 || newPassword !== confirmPassword)
    return res.redirect("/account?error=" + encodeURIComponent("New passwords must match and be at least 8 characters."));
  accountModel.changePassword(id, newPassword);
  req.session.destroy(() => res.redirect("/account/login?notice=Password updated. Please sign in."));
};

exports.deleteAccount = (req, res) => {
  const { password = "" } = req.body;
  if (!accountModel.verifyPassword(req.session.user.id, password))
    return res.redirect("/account?error=" + encodeURIComponent("Password incorrect. Account not deleted."));
  accountModel.deleteAccount(req.session.user.id);
  req.session.destroy(() => res.redirect("/account/login?notice=Account deleted."));
};

// Simplified local-demo password reset (not safe for public deployment).
const attempts = new Map();
exports.showForgot = (req, res) => res.render('account/forgot', { title: 'Forgot Password', error: null, notice: null, email: '', firstName: '', lastName: '' });
exports.requestReset = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirmPassword || '');
  const key = req.ip || 'local';
  const now = Date.now();
  let entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (now > entry.until) entry = { count: 0, until: now + 15 * 60 * 1000 };
  const renderError = (error, status = 400) => res.status(status).render('account/forgot', { title: 'Forgot Password', error, notice: null, email, firstName, lastName });
  if (entry.count >= 5) return renderError('Too many attempts. Try again in 15 minutes.', 429);
  if (password.length < 8 || password !== confirm) return renderError('Passwords must match and contain at least 8 characters.');
  const user = accountModel.findByEmail(email);
  if (!user || !firstName || !lastName ||
      user.firstName.trim().toLowerCase() !== firstName.toLowerCase() ||
      user.lastName.trim().toLowerCase() !== lastName.toLowerCase()) {
    entry.count++; attempts.set(key, entry);
    return renderError('Account information does not match.');
  }
  accountModel.changePassword(user.id, password);
  attempts.delete(key);
  res.redirect('/account/login?notice=' + encodeURIComponent('Password reset. Please sign in.'));
};
