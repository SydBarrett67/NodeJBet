const express = require('express');
const path = require('path');

const PORT = 5000;

const app = express();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/pages/'));

app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes

// Home
app.get('/', (req, res) => {
    res.render('home/home');
});

// Login
app.get('/login', (req, res) => {
    res.render('login/login');
});

// Register
app.get('/register', (req, res) => {
    res.render('register/register');
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.render('dashboard/dashboard', {
        user: {
            username: 'Player123', // TODO 
            balance: 10000,
            gamesPlayed: 42,
            gamesWon: 21
        }
    });
});

// Roulette
app.get('/games/roulette', (req, res) => {
    res.render('games/roulette');
});

// Aviator
app.get('/games/aviator', (req, res) => {
    res.render('games/aviator');
});

// Start server
app.listen(PORT, () => {
    console.log('Listening on ' + PORT);
});
