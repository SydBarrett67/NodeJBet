const attachWebSocket = require('./websocket');
const express = require('express');
const path = require('path');
const http = require('http');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs');

const PORT = 5000;

const app = express();
const server = http.createServer(app);

const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Crea la cartella e il file utenti se non esistono
if (!fs.existsSync(path.dirname(USERS_FILE))) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
}

function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8').trim();

        if (!data) {
            saveUsers([]);
            return [];
        }

        const users = JSON.parse(data);

        if (!Array.isArray(users)) {
            throw new Error('users.json deve contenere un array');
        }

        return users;

    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('users.json contiene JSON non valido:', error.message);
        }

        throw error;
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/pages'));

// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'nodejbet-secret-da-cambiare',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
});

app.use(sessionMiddleware);

// Rende disponibile l'utente in tutte le pagine EJS
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
});

// HOME
app.get('/', (req, res) => {
    res.render('home/home');
});

// REGISTER - Pagina
app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('register/register');
});

// REGISTER - Invio form
app.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        if (!username || !email || !password || !confirmPassword) {
            return res.status(400).render('register/register', {
                error: 'Compila tutti i campi.'
            });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).render('register/register', {
                error: 'Lo username deve avere tra 3 e 20 caratteri.'
            });
        }

        if (password.length < 8) {
            return res.status(400).render('register/register', {
                error: 'La password deve contenere almeno 8 caratteri.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).render('register/register', {
                error: 'Le password non coincidono.'
            });
        }

        const users = getUsers();

        const existingUser = users.find(user =>
            user.username.toLowerCase() === username.toLowerCase() ||
            user.email.toLowerCase() === email.toLowerCase()
        );

        if (existingUser) {
            return res.status(400).render('register/register', {
                error: 'Username o email già utilizzati.'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const newUser = {
            id: 'usr_' + Date.now(),
            username,
            email: email.toLowerCase(),
            password: hashedPassword,
            balance: 10000,
            gamesPlayed: 0,
            gamesWon: 0,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        req.session.user = {
            id: newUser.id,
            username: newUser.username,
            balance: newUser.balance,
            gamesPlayed: newUser.gamesPlayed,
            gamesWon: newUser.gamesWon
        };

        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).render('register/register', {
            error: 'Errore durante la registrazione.'
        });
    }
});

// LOGIN - Pagina
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login/login');
});

// LOGIN - Invio form
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = getUsers();

        const user = users.find(u =>
            u.username.toLowerCase() === (username || '').toLowerCase() ||
            u.email.toLowerCase() === (username || '').toLowerCase()
        );

        if (!user || !(await bcrypt.compare(password || '', user.password))) {
            return res.status(401).render('login/login', {
                error: 'Credenziali non valide.'
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            balance: user.balance,
            gamesPlayed: user.gamesPlayed,
            gamesWon: user.gamesWon
        };

        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).render('login/login', {
            error: 'Errore durante il login.'
        });
    }
});

// LOGOUT
app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// DASHBOARD
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const users = getUsers();
    const user = users.find(u => u.id === req.session.user.id);

    if (!user) {
        return req.session.destroy(() => res.redirect('/login'));
    }

    req.session.user = user;

    res.render('dashboard/dashboard', { user });
});

// GAMES
app.get('/games/roulette', (req, res) => {
    res.render('games/roulette');
});

app.get('/games/aviator', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.render('games/aviator');
});

// 404
app.use((req, res) => {
    res.status(404).send('404 - Page not found');
});

attachWebSocket(server, sessionMiddleware);
server.listen(PORT, () => {
    console.log(`NodeJBet running at http://localhost:${PORT}`);
});

module.exports = { app, server };

