
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../../data/users.json');

function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

function saveUsers(users) {
    const tempFile = USERS_FILE + '.tmp';

    fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
    fs.renameSync(tempFile, USERS_FILE);
}

function updateBalance(userId, amount) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
        throw new Error('Utente non trovato');
    }

    user.balance += amount;
    saveUsers(users);

    return user.balance;
}

function updateGameStats(userId, won) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) return;

    user.gamesPlayed = (user.gamesPlayed || 0) + 1;

    if (won) {
        user.gamesWon = (user.gamesWon || 0) + 1;
    }

    saveUsers(users);
}

function createAviatorEngine(sendToAll, sendToUser) {
    let roundId = 0;
    let phase = 'waiting';
    let multiplier = 1;
    let crashPoint = 1;
    let startTime = null;
    let waitingStarted = Date.now();

    const bets = new Map();
    const history = [];

    const WAITING_TIME = 8000;
    const TICK_RATE = 100;

    function getPublicState() {
        return {
            roundId,
            phase,
            multiplier: Number(multiplier.toFixed(2)),
            history: history.slice(0, 10),
            waitingTime: phase === 'waiting'
                ? Math.max(0, WAITING_TIME - (Date.now() - waitingStarted))
                : 0
        };
    }

    function broadcast() {
        sendToAll({
            type: 'state',
            state: getPublicState()
        });

        const users = getUsers();

        for (const user of users) {
            sendToUser(user.id, {
                type: 'balance',
                balance: user.balance
            });
        }

        for (const [userId, bet] of bets.entries()) {
            sendToUser(userId, {
                type: 'bet',
                bet: {
                    amount: bet.amount,
                    status: bet.status,
                    multiplier: bet.cashoutMultiplier || null,
                    payout: bet.payout || 0
                }
            });
        }
    }

    function startRound() {
        roundId++;
        phase = 'waiting';
        multiplier = 1;

        crashPoint = Number(
            (1.15 + Math.random() * 5.85).toFixed(2)
        );

        startTime = null;
        waitingStarted = Date.now();

        bets.clear();

        broadcast();
    }

    function startFlight() {
        phase = 'flight';
        startTime = Date.now();
        broadcast();
    }

    function crash() {
        phase = 'crashed';
        multiplier = crashPoint;

        // Le puntate ancora attive vengono perse.
        for (const [userId, bet] of bets.entries()) {
            if (bet.status === 'active') {
                bet.status = 'lost';
                updateGameStats(userId, false);

                sendToUser(userId, {
                    type: 'bet',
                    bet: {
                        amount: bet.amount,
                        status: 'lost',
                        multiplier: null,
                        payout: 0
                    }
                });
            }
        }

        history.unshift({
            roundId,
            multiplier: crashPoint.toFixed(2) + 'x'
        });

        if (history.length > 10) {
            history.pop();
        }

        broadcast();

        setTimeout(startRound, 3000);
    }

    function placeBet(userId, amount) {
        if (phase !== 'waiting') {
            return sendToUser(userId, {
                type: 'error',
                message: 'La partita è già iniziata.'
            });
        }

        if (bets.has(userId)) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Hai già effettuato una puntata.'
            });
        }

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Importo non valido.'
            });
        }

        const users = getUsers();
        const user = users.find(u => u.id === userId);

        if (!user || user.balance < amount) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Saldo insufficiente.'
            });
        }

        user.balance -= amount;
        saveUsers(users);

        bets.set(userId, {
            amount,
            status: 'active',
            payout: 0,
            statsUpdated: false
        });

        sendToUser(userId, {
            type: 'bet',
            bet: {
                amount,
                status: 'active',
                payout: 0
            }
        });

        sendToUser(userId, {
            type: 'balance',
            balance: user.balance
        });
    }

    function cashOut(userId) {
        const bet = bets.get(userId);

        if (
            phase !== 'flight' ||
            !bet ||
            bet.status !== 'active'
        ) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Non puoi incassare in questo momento.'
            });
        }

        const payout = Math.floor(bet.amount * multiplier);

        try {
            const newBalance = updateBalance(userId, payout);

            bet.status = 'cashed';
            bet.cashoutMultiplier = Number(multiplier.toFixed(2));
            bet.payout = payout;

            if (!bet.statsUpdated) {
                updateGameStats(userId, true);
                bet.statsUpdated = true;
            }

            sendToUser(userId, {
                type: 'bet',
                bet: {
                    amount: bet.amount,
                    status: 'cashed',
                    multiplier: bet.cashoutMultiplier,
                    payout
                }
            });

            sendToUser(userId, {
                type: 'balance',
                balance: newBalance
            });

        } catch (error) {
            console.error('Errore cashout:', error);
        }
    }

    function handleMessage(userId, message) {
        if (!message || typeof message !== 'object') return;

        switch (message.action) {
            case 'bet':
                placeBet(userId, message.amount);
                break;

            case 'cashout':
                cashOut(userId);
                break;

            case 'state':
                sendToUser(userId, {
                    type: 'state',
                    state: getPublicState()
                });
                break;
        }
    }

    setInterval(() => {
        if (phase === 'waiting') {
            if (Date.now() - waitingStarted >= WAITING_TIME) {
                startFlight();
            }
        }

        if (phase === 'flight') {
            const elapsed = (Date.now() - startTime) / 1000;

            multiplier = Math.exp(elapsed * 0.12);

            if (multiplier >= crashPoint) {
                crash();
            } else {
                broadcast();
            }
        }
    }, TICK_RATE);

    startRound();

    return {
        handleMessage,
        getPublicState
    };
}

module.exports = createAviatorEngine;

