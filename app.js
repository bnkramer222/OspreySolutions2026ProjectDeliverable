const express = require('express');
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Each module has its own routes file
app.use('/account', require('./routes/accountRoutes'));
app.use('/files', require('./routes/fileRoutes'));
app.use('/dashboard', require('./routes/dashboardRoutes'));
app.use('/reports', require('./routes/reportRoutes'));

app.get('/', (req, res) => res.redirect('/dashboard'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
