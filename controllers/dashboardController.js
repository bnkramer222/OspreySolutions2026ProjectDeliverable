// CONTROLLER - Dashboard (Jude)
const dashboardModel = require("../models/dashboardModel");
const { fmt } = require("../models/reports");

// GET /dashboard - headline numbers, quick results, recent imports
exports.index = async (req, res, next) => {
  try {
    res.render("dashboard/index", { title: "Dashboard", ...(await dashboardModel.summary()), fmt });
  } catch (err) {
    next(err);
  }
};

// GET /dashboard/schools?state=GA - schools and their survey counts
exports.schools = async (req, res, next) => {
  try {
    const selectedState = req.query.state || "";
    const { states, schools } = await dashboardModel.getSchools(selectedState);
    res.render("dashboard/schools", { title: "Schools", schools, states, selectedState });
  } catch (err) {
    next(err);
  }
};

// GET /dashboard/data?type=pre&search=lincoln&page=2 - browse survey responses
exports.data = async (req, res, next) => {
  try {
    const type = ["pre", "post", "general"].includes(req.query.type) ? req.query.type : "all";
    const search = String(req.query.search || "").trim().slice(0, 80);
    const school = String(req.query.school || "");
    const page = Number(req.query.page) || 1;
    const result = await dashboardModel.getRecords({ type, search, school, page });
    res.render("dashboard/data", { title: "Survey data", ...result, type, search, school });
  } catch (err) {
    next(err);
  }
};
