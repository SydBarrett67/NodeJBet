
const balanceElement = document.getElementById('roulette-balance');
const statusElement = document.getElementById('roulette-status');
const resultElement = document.getElementById('result-number');
const messageElement = document.getElementById('roulette-message');
const countdownElement = document.getElementById('countdown');
const historyElement = document.getElementById('roulette-history');
const amountInput = document.getElementById('roulette-amount');
const numberInput = document.getElementById('roulette-number');
const playButton = document.getElementById('roulette-play');
const myBetElement = document.getElementById('roulette-my-bet');
const potentialElement = document.getElementById('roulette-potential');

let balance = 0;
let selectedBet = null;
let currentBet = null;
let gamePhase = 'betting';
let currentRoundId = null;

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(
    `${protocol}//${location.host}/roulette-ws`
);

function formatCredits(value) {
    return Number(value).toLocaleString('it-IT');
}

function send(action, data = {}) {
    if (socket.readyState !== WebSocket.OPEN) {
        messageElement.textContent =
            'Connessione al server non disponibile.';
        return;
    }

    socket.send(JSON.stringify({ action, ...data }));
}

function getSelectionLabel(selection) {
    if (!selection) return 'Nessuna';

    if (selection.type === 'number') {
        return `Numero ${selection.value}`;
    }

    const labels = {
        red: 'Rosso',
        black: 'Nero',
        even: 'Pari',
        odd: 'Dispari',
        low: '1–18',
        high: '19–36'
    };

    return labels[selection.type] || 'Nessuna';
}

function getMultiplier(selection) {
    return selection && selection.type === 'number' ? 36 : 2;
}

socket.addEventListener('open', () => {
    send('state');
    updateControls();
});

socket.addEventListener('message', event => {
    let data;

    try {
        data = JSON.parse(event.data);
    } catch {
        return;
    }

    switch (data.type) {
        case 'state':
            updateGame(data.state);
            break;

        case 'balance':
            balance = data.balance;
            balanceElement.textContent = formatCredits(balance);
            updateControls();
            break;

        case 'bet':
            currentBet = data.bet;
            updateBet();
            updateControls();
            break;

        case 'error':
            messageElement.textContent = data.message;
            break;
    }
});

socket.addEventListener('close', () => {
    statusElement.textContent = 'Disconnesso';
    messageElement.textContent =
        'Connessione persa. Ricarica la pagina.';
    playButton.disabled = true;
});

function updateGame(state) {
    // Nuovo round: la vecchia puntata non deve bloccare il giocatore.
    if (
        currentRoundId !== null &&
        state.roundId !== currentRoundId
    ) {
        currentBet = null;
        updateBet();
    }

    currentRoundId = state.roundId;
    gamePhase = state.phase;

    countdownElement.textContent =
        Math.ceil(state.remainingTime / 1000);

    if (state.phase === 'betting') {
        statusElement.textContent = 'Puntate aperte';
        messageElement.textContent = 'Scegli la tua puntata!';
        resultElement.textContent = '?';
        resultElement.className = 'roulette-result-number';
    }

    if (state.phase === 'spinning') {
        statusElement.textContent = 'Ruota in movimento';
        messageElement.textContent = 'La pallina sta girando...';

        if (state.result !== null) {
            resultElement.textContent = state.result;
            resultElement.className =
                `roulette-result-number ${state.resultColor}`;
        }
    }

    updateHistory(state.history || []);
    updateControls();
}

function updateBet() {
    if (!currentBet) {
        myBetElement.textContent = 'Nessuna';
        potentialElement.textContent = 'Vincita potenziale: 0 NJ';
        return;
    }

    myBetElement.textContent =
        `${formatCredits(currentBet.amount)} NJ su ${getSelectionLabel(currentBet.selection)}`;

    const potential =
        currentBet.amount * getMultiplier(currentBet.selection);

    if (currentBet.status === 'pending') {
        potentialElement.textContent =
            `Vincita potenziale: ${formatCredits(potential)} NJ`;
    } else if (currentBet.status === 'won') {
        potentialElement.textContent =
            `Hai vinto ${formatCredits(currentBet.payout)} NJ!`;

        messageElement.textContent =
            `Complimenti! Hai vinto ${formatCredits(currentBet.payout)} crediti.`;
    } else if (currentBet.status === 'lost') {
        potentialElement.textContent = 'Puntata persa';
        messageElement.textContent = 'Peccato! Hai perso questa puntata.';
    }
}

function updateControls() {
    const canBet =
        gamePhase === 'betting' &&
        !currentBet &&
        balance > 0 &&
        socket.readyState === WebSocket.OPEN;

    playButton.disabled = !canBet;

    playButton.textContent = currentBet
        ? 'Puntata piazzata'
        : gamePhase === 'betting'
            ? 'Piazza puntata'
            : 'Puntate chiuse';
}

function updateHistory(history) {
    if (!history.length) {
        historyElement.innerHTML =
            '<span class="muted">Nessun risultato</span>';
        return;
    }

    historyElement.innerHTML = history.map(item => `
        <span class="roulette-history-number ${item.color}">
            ${item.number}
        </span>
    `).join('');
}

function selectBet(type) {
    selectedBet = { type };

    document.querySelectorAll('.roulette-option').forEach(button => {
        button.classList.toggle(
            'selected',
            button.dataset.bet === type
        );
    });

    numberInput.value = '';
    updatePotential();
}

function updatePotential() {
    if (!selectedBet) {
        potentialElement.textContent =
            'Vincita potenziale: 0 NJ';
        return;
    }

    const amount = Number(amountInput.value);

    if (!Number.isSafeInteger(amount) || amount <= 0) return;

    const multiplier = getMultiplier(selectedBet);

    potentialElement.textContent =
        `Vincita potenziale: ${formatCredits(amount * multiplier)} NJ`;
}

document.querySelectorAll('.roulette-option').forEach(button => {
    button.addEventListener('click', () => {
        selectBet(button.dataset.bet);
    });
});

numberInput.addEventListener('input', () => {
    if (numberInput.value === '') return;

    const number = Number(numberInput.value);

    if (
        Number.isInteger(number) &&
        number >= 0 &&
        number <= 36
    ) {
        selectedBet = {
            type: 'number',
            value: number
        };

        document.querySelectorAll('.roulette-option').forEach(button => {
            button.classList.remove('selected');
        });

        updatePotential();
    }
});

amountInput.addEventListener('input', updatePotential);

document.querySelectorAll('[data-amount]').forEach(button => {
    button.addEventListener('click', () => {
        amountInput.value = button.dataset.amount;
        updatePotential();
    });
});

playButton.addEventListener('click', () => {
    if (!selectedBet) {
        messageElement.textContent =
            'Seleziona prima una puntata.';
        return;
    }

    const amount = Number(amountInput.value);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        messageElement.textContent =
            'Inserisci un importo valido.';
        return;
    }

    if (amount > balance) {
        messageElement.textContent =
            'Non hai abbastanza crediti.';
        return;
    }

    if (selectedBet.type === 'number') {
        const number = Number(selectedBet.value);

        if (
            !Number.isInteger(number) ||
            number < 0 ||
            number > 36
        ) {
            messageElement.textContent =
                'Scegli un numero da 0 a 36.';
            return;
        }
    }

    playButton.disabled = true;

    send('bet', {
        amount,
        selection: selectedBet
    });
});

updateControls();

