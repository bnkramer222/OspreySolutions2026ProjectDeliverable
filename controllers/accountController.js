// CONTROLLER - Account Management (Victoria)
// Model calls hit the database, so they're async: every one uses "await".
// Errors are passed to next(err), which shows the error page from app.js.
const accountModel = require("../models/accountModel");

// Saves the session to the database BEFORE redirecting, so the next
// page already sees the user as logged in.
const saveAndRedirect = (req, res, next, url) =>
  req.session.save((err) => (err ? next(err) : res.redirect(url)));

const backToAccount = (res, key, text) =>
  res.redirect(`/account?${key}=${encodeURIComponent(text)}`);

// GET /account - who's logged in + all admin accounts
exports.index = async (req, res, next) => {
  try {
    res.render("account/index", {
      title: "Account",
      accounts: await accountModel.getAll(),
      pending: await accountModel.getPending(),
      notice: req.query.notice || null,
      error: req.query.error || null,
    });
  } catch (err) {
    next(err);
  }
};

// GET /account/login
exports.showLogin = (req, res) => {
  res.render("account/login", {
    title: "Log In",
    error: null,
    email: "",
    notice: req.query.notice || null,
  });
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
        notice: null,
      });
    }
    if (!user.approved) {
      return res.render("account/login", {
        title: "Log In",
        error: "Your account is waiting for approval. A Planned to A.T. staff member needs to approve it before you can sign in.",
        email,
        notice: null,
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
  const { firstName = "", lastName = "", email = "", password = "" } = req.body;
  const showError = (error) =>
    res.render("account/register", { title: "Create Account", error, firstName, lastName, email });

  try {
    if (!firstName.trim() || !lastName.trim() || !email.trim())
      return showError("First name, last name and email are required.");
    if (password.length < 8) return showError("Password must be at least 8 characters.");
    if (await accountModel.findByEmail(email))
      return showError("An account with that email already exists.");

    const user = await accountModel.create({ firstName, lastName, email, password });
    if (!user.approved) {
      return res.redirect("/account/login?notice=" + encodeURIComponent("Account created. A Planned to A.T. staff member needs to approve it before you can sign in."));
    }
    req.session.user = user; // the very first account is approved right away
    saveAndRedirect(req, res, next, "/dashboard");
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the database blocks the second one
    if (err.code === "23505") return showError("An account with that email already exists.");
    next(err);
  }
};

// POST /account/approve/12 and /account/deny/12 - handle a waiting sign-up
exports.approveUser = async (req, res, next) => {
  try {
    await accountModel.approve(Number(req.params.id));
    backToAccount(res, "notice", "Account approved. They can sign in now.");
  } catch (err) {
    next(err);
  }
};
exports.denyUser = async (req, res, next) => {
  try {
    await accountModel.deny(Number(req.params.id));
    backToAccount(res, "notice", "Sign-up request removed.");
  } catch (err) {
    next(err);
  }
};

// POST /account/logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect("/account/login"));
};

// POST /account/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword = "", newPassword = "", confirmPassword = "" } = req.body;
    const id = req.session.user.id;
    if (!(await accountModel.verifyPassword(id, currentPassword)))
      return backToAccount(res, "error", "Current password is incorrect.");
    if (newPassword.length < 8 || newPassword !== confirmPassword)
      return backToAccount(res, "error", "New passwords must match and be at least 8 characters.");
    await accountModel.changePassword(id, newPassword);
    req.session.destroy(() =>
      res.redirect("/account/login?notice=" + encodeURIComponent("Password updated. Please sign in.")),
    );
  } catch (err) {
    next(err);
  }
};

// POST /account/delete
exports.deleteAccount = async (req, res, next) => {
  try {
    const id = req.session.user.id;
    if (!(await accountModel.verifyPassword(id, req.body.password || "")))
      return backToAccount(res, "error", "Password incorrect. Account not deleted.");
    await accountModel.deleteAccount(id);
    req.session.destroy(() =>
      res.redirect("/account/login?notice=" + encodeURIComponent("Account deleted.")),
    );
  } catch (err) {
    next(err);
  }
};

// ---- Forgot password ----
// Simplified reset for the class demo: matching email + first + last name
// lets you pick a new password. A real launch should email a reset link.
// Attempts are limited per IP address (5 every 15 minutes).
const attempts = new Map();
const forgotPage = (fields = {}) => ({
  title: "Forgot Password",
  error: null,
  notice: null,
  email: "",
  firstName: "",
  lastName: "",
  ...fields,
});

exports.showForgot = (req, res) => res.render("account/forgot", forgotPage());

exports.requestReset = async (req, res, next) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const password = String(req.body.password || "");
  const confirm = String(req.body.confirmPassword || "");
  const renderError = (error, status = 400) =>
    res.status(status).render("account/forgot", forgotPage({ error, email, firstName, lastName }));

  const key = req.ip || "local";
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || now > entry.until) entry = { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.count >= 5) return renderError("Too many attempts. Try again in 15 minutes.", 429);
  if (password.length < 8 || password !== confirm)
    return renderError("Passwords must match and contain at least 8 characters.");

  try {
    const user = await accountModel.findByEmail(email);
    const same = (a, b) => a.trim().toLowerCase() === b.toLowerCase();
    if (!user || !same(user.firstName, firstName) || !same(user.lastName, lastName)) {
      entry.count++;
      attempts.set(key, entry);
      return renderError("Account information does not match.");
    }
    await accountModel.changePassword(user.id, password);
    attempts.delete(key);
    res.redirect("/account/login?notice=" + encodeURIComponent("Password reset. Please sign in."));
  } catch (err) {
    next(err);
  }
};
