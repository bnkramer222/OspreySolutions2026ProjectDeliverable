// MODEL - Dashboard (Jude)
// Holds data in memory for now. Swap for a database later.

const schools = [
  {
    school: 'Riverside High School',
    location: 'Atlanta, GA',
    state: 'GA'
  },
  {
    school: 'Lincoln Middle School',
    location: 'Jacksonville, FL',
    state: 'FL'
  },
  {
    school: 'Central High School',
    location: 'Tampa, FL',
    state: 'FL'
  }
];

const records = [
  { type: 'Pre-Survey', id: 'S101', school: 'Riverside High School', location: 'Atlanta, GA', program: 'My Money Grows', grade: '11' },
  { type: 'Pre-Survey', id: 'S102', school: 'Riverside High School', location: 'Atlanta, GA', program: 'My Money Grows', grade: '11' },
  { type: 'Post-Survey', id: 'S103', school: 'Riverside High School', location: 'Atlanta, GA', program: 'My Money Grows', grade: '11' },
  { type: 'Pre-Survey', id: 'S201', school: 'Lincoln Middle School', location: 'Jacksonville, FL', program: 'Collegiate Workshop', grade: '9' },
  { type: 'Post-Survey', id: 'S202', school: 'Lincoln Middle School', location: 'Jacksonville, FL', program: 'Collegiate Workshop', grade: '9' },
  { type: 'Pre-Survey', id: 'S301', school: 'Central High School', location: 'Tampa, FL', program: 'My Money Grows', grade: '10' },
  { type: 'Post-Survey', id: 'S302', school: 'Central High School', location: 'Tampa, FL', program: 'My Money Grows', grade: '10' }
];

// Return all survey records.
function getAll() {
  return records;
}

// Return schools with their survey counts.
function getSchools() {
  return schools.map(school => {
    const schoolRecords = records.filter(
      record => record.school === school.school
    );

    return {
      ...school,
      preCount: schoolRecords.filter(
        record => record.type === 'Pre-Survey'
      ).length,
      postCount: schoolRecords.filter(
        record => record.type === 'Post-Survey'
      ).length
    };
  });
}

// Return all survey records.
function getRecords() {
  return records;
}

module.exports = {
  getAll,
  getSchools,
  getRecords
};

