const express = require('express');
const path = require('path');
const ejs = require('ejs');

const PORT = 5000;

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/pages/'));
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
// Home
app.get('/home', (req, res) => {
    res.render('home/home');
});

// Login
app.get('/login', (req, res) => {
    res.render('login/login');
});



// Start server
app.listen(PORT, () => {
    console.log('Listening on ' + PORT);
});
