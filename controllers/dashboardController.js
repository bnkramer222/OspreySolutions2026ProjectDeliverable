// CONTROLLER - Dashboard (Jude)
const dashboardModel = require('../models/dashboardModel');

// Display the main dashboard.
exports.index = (req, res) => {
  res.render('dashboard/index', {
    title: 'Dashboard',
    data: dashboardModel.getAll()
  });
};

// Display schools and filter by state.
exports.schools = (req, res) => {
  const selectedState = req.query.state || '';

  let schools = dashboardModel.getSchools();

  if (selectedState) {
    schools = schools.filter(
      school => school.state === selectedState
    );
  }

  res.render('dashboard/schools', {
    title: 'States and Schools',
    schools,
    selectedState
  });
};

// Display survey records and apply filters.
exports.data = (req, res) => {
  const type = req.query.type || 'All';
  const search = req.query.search || '';

  let records = dashboardModel.getRecords();

  if (type !== 'All') {
    records = records.filter(
      record => record.type === type
    );
  }

  if (search) {
    const searchText = search.toLowerCase();

    records = records.filter(record =>
      record.school.toLowerCase().includes(searchText) ||
      record.id.toLowerCase().includes(searchText) ||
      record.program.toLowerCase().includes(searchText)
    );
  }

  res.render('dashboard/data', {
    title: 'Survey Data',
    records,
    type,
    search,
    totalRecords: dashboardModel.getRecords().length
  });
};
