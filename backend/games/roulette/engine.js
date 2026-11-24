
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '../../data/users.json');

const RED_NUMBERS = [
    1, 3, 5, 7, 9, 12, 14, 16, 18,
    19, 21, 23, 25, 27, 30, 32, 34, 36
];

const BETTING_TIME = 15000;
const SPIN_TIME = 5000;
const TICK_RATE = 250;

function getUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8').trim();

    if (!data) return [];

    const users = JSON.parse(data);

    if (!Array.isArray(users)) {
        throw new Error('users.json non valido');
    }

    return users;
}

function saveUsers(users) {
    const tempFile = USERS_FILE + '.tmp';

    fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
    fs.renameSync(tempFile, USERS_FILE);
}

function getColor(number) {
    if (number === 0) return 'green';

    return RED_NUMBERS.includes(number) ? 'red' : 'black';
}

function isWinningBet(selection, number) {
    switch (selection.type) {
        case 'number':
            return Number(selection.value) === number;

        case 'red':
        case 'black':
            return getColor(number) === selection.type;

        case 'even':
            return number !== 0 && number % 2 === 0;

        case 'odd':
            return number !== 0 && number % 2 === 1;

        case 'low':
            return number >= 1 && number <= 18;

        case 'high':
            return number >= 19 && number <= 36;

        default:
            return false;
    }
}

function getMultiplier(selection) {
    return selection.type === 'number' ? 36 : 2;
}

function createRouletteEngine(sendToAll, sendToUser) {
    let roundId = 0;
    let phase = 'betting';
    let result = null;
    let phaseStarted = Date.now();

    const bets = new Map();
    const history = [];

    function publicState() {
        const duration = phase === 'betting'
            ? BETTING_TIME
            : SPIN_TIME;

        return {
            roundId,
            phase,
            result,
            resultColor: result === null ? null : getColor(result),
            remainingTime: Math.max(
                0,
                duration - (Date.now() - phaseStarted)
            ),
            history: history.slice(0, 12)
        };
    }

    function sendBalance(userId) {
        const user = getUsers().find(u => u.id === userId);

        if (user) {
            sendToUser(userId, {
                type: 'balance',
                balance: user.balance
            });
        }
    }

    function sendBet(userId) {
        const bet = bets.get(userId);

        sendToUser(userId, {
            type: 'bet',
            bet: bet ? {
                amount: bet.amount,
                selection: bet.selection,
                status: bet.status,
                payout: bet.payout || 0
            } : null
        });
    }

    function broadcast() {
        sendToAll({
            type: 'state',
            state: publicState()
        });

        for (const userId of bets.keys()) {
            sendBet(userId);
        }
    }

    function startRound() {
        roundId++;
        phase = 'betting';
        result = null;
        phaseStarted = Date.now();

        bets.clear();

        broadcast();
    }

    function spin() {
        phase = 'spinning';
        phaseStarted = Date.now();

        // Estrazione casuale eseguita esclusivamente dal server.
        result = crypto.randomInt(0, 37);

        for (const [userId, bet] of bets.entries()) {
            const won = isWinningBet(bet.selection, result);

            const users = getUsers();
            const user = users.find(u => u.id === userId);

            if (!user) {
                bet.status = 'lost';
                bet.payout = 0;
                sendBet(userId);
                continue;
            }

            // Aggiornamento statistiche: una partita per puntata.
            user.gamesPlayed = (user.gamesPlayed || 0) + 1;

            if (won) {
                const payout = bet.amount * getMultiplier(bet.selection);

                user.balance = (user.balance || 0) + payout;
                user.gamesWon = (user.gamesWon || 0) + 1;

                bet.status = 'won';
                bet.payout = payout;
            } else {
                bet.status = 'lost';
                bet.payout = 0;
            }

            // Salvataggio di saldo e statistiche nello stesso passaggio.
            saveUsers(users);

            sendBet(userId);
            sendBalance(userId);
        }

        history.unshift({
            roundId,
            number: result,
            color: getColor(result)
        });

        if (history.length > 12) {
            history.pop();
        }

        broadcast();
    }

    function placeBet(userId, selection, amount) {
        if (phase !== 'betting') {
            return sendToUser(userId, {
                type: 'error',
                message: 'Le puntate sono chiuse.'
            });
        }

        if (bets.has(userId)) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Hai già piazzato una puntata in questo round.'
            });
        }

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Importo non valido.'
            });
        }

        if (!selection || typeof selection !== 'object') {
            return sendToUser(userId, {
                type: 'error',
                message: 'Puntata non valida.'
            });
        }

        const validTypes = [
            'number',
            'red',
            'black',
            'even',
            'odd',
            'low',
            'high'
        ];

        if (!validTypes.includes(selection.type)) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Puntata non valida.'
            });
        }

        if (selection.type === 'number') {
            const number = Number(selection.value);

            if (!Number.isInteger(number) || number < 0 || number > 36) {
                return sendToUser(userId, {
                    type: 'error',
                    message: 'Scegli un numero da 0 a 36.'
                });
            }

            selection = {
                type: 'number',
                value: number
            };
        } else {
            selection = {
                type: selection.type
            };
        }

        const users = getUsers();
        const user = users.find(u => u.id === userId);

        if (!user || user.balance < amount) {
            return sendToUser(userId, {
                type: 'error',
                message: 'Saldo insufficiente.'
            });
        }

        // Sottrazione della puntata.
        user.balance -= amount;

        saveUsers(users);

        bets.set(userId, {
            amount,
            selection,
            status: 'pending',
            payout: 0
        });

        sendBet(userId);
        sendBalance(userId);
    }

    function handleMessage(userId, message) {
        if (!message || typeof message !== 'object') return;

        if (message.action === 'state') {
            sendToUser(userId, {
                type: 'state',
                state: publicState()
            });

            sendBet(userId);
            sendBalance(userId);
        }

        if (message.action === 'bet') {
            placeBet(
                userId,
                message.selection,
                message.amount
            );
        }
    }

    setInterval(() => {
        const elapsed = Date.now() - phaseStarted;

        if (phase === 'betting' && elapsed >= BETTING_TIME) {
            spin();
        } else if (phase === 'spinning' && elapsed >= SPIN_TIME) {
            startRound();
        }
    }, TICK_RATE);

    startRound();

    return {
        handleMessage,
        getPublicState: publicState
    };
}

module.exports = createRouletteEngine;

