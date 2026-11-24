
const multiplierElement = document.getElementById('multiplier');
const planeElement = document.getElementById('plane');
const statusElement = document.getElementById('round-status');
const messageElement = document.getElementById('game-message');

const balanceElement = document.getElementById('balance');
const betInput = document.getElementById('bet-amount');
const playButton = document.getElementById('play-button');

const activeBetElement = document.getElementById('active-bet');
const potentialWinElement = document.getElementById('potential-win');

const roundElement = document.getElementById('round-number');
const historyElement = document.getElementById('history');

let balance = 0;
let currentMultiplier = 1;
let currentBet = null;
let gamePhase = 'waiting';

const socketProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const socket = new WebSocket(`${socketProtocol}//${location.host}/ws`);

function formatCredits(value) {
    return Number(value).toLocaleString('it-IT');
}

function send(action, data = {}) {
    if (socket.readyState !== WebSocket.OPEN) {
        messageElement.textContent = 'Connessione al server non disponibile.';
        return;
    }

    socket.send(JSON.stringify({ action, ...data }));
}

socket.addEventListener('open', () => {
    send('state');
});

socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);

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
            break;

        case 'error':
            messageElement.textContent = data.message;
            break;
    }
});

socket.addEventListener('close', () => {
    statusElement.textContent = 'Disconnesso';
    messageElement.textContent = 'Connessione persa. Ricarica la pagina.';
});

function updateGame(state) {
    gamePhase = state.phase;
    currentMultiplier = state.multiplier;

    roundElement.textContent = String(state.roundId).padStart(3, '0');

    multiplierElement.textContent = `${state.multiplier.toFixed(2)}x`;

    if (state.phase === 'waiting') {
        statusElement.textContent = 'Prossimo decollo';
        messageElement.textContent = 'Effettua la tua puntata!';
        planeElement.style.transform = 'translate(0, 0) rotate(0deg)';
        planeElement.style.opacity = '1';

        playButton.textContent = currentBet
            ? 'Puntata effettuata'
            : 'Gioca';

        playButton.disabled = Boolean(currentBet);
    }

    if (state.phase === 'flight') {
        statusElement.textContent = 'Aereo in volo';
        messageElement.textContent = 'Incassa prima del crash!';

        const progress = Math.min(state.multiplier / 6, 1);
        planeElement.style.transform =
            `translate(${progress * 180}px, ${-progress * 100}px) rotate(-15deg)`;

        playButton.textContent = 'INCASSA';
        playButton.disabled = !currentBet || currentBet.status !== 'active';
    }

    if (state.phase === 'crashed') {
        statusElement.textContent = 'CRASH!';
        messageElement.textContent = `L'aereo è precipitato a ${state.multiplier.toFixed(2)}x`;

        planeElement.style.opacity = '0';
        playButton.textContent = 'Prossimo round';
        playButton.disabled = true;
    }

    if (state.phase === 'waiting' && state.waitingTime > 0) {
        messageElement.textContent =
            `Prossimo decollo tra ${(state.waitingTime / 1000).toFixed(1)} secondi`;
    }

    updateBet();
    updateControls();
    updateHistory(state.history || []);
}

function updateBet() {
    if (!currentBet) {
        activeBetElement.textContent = '0 NJ';
        potentialWinElement.textContent = '0 NJ';
        return;
    }

    activeBetElement.textContent =
        `${formatCredits(currentBet.amount)} NJ`;

    if (currentBet.status === 'active') {
        const potential = Math.floor(currentBet.amount * currentMultiplier);
        potentialWinElement.textContent = `${formatCredits(potential)} NJ`;
    } else {
        potentialWinElement.textContent =
            `${formatCredits(currentBet.payout)} NJ`;
    }

    if (currentBet.status === 'cashed') {
        messageElement.textContent =
            `Hai incassato ${formatCredits(currentBet.payout)} NJ!`;
    }

    if (currentBet.status === 'active' && gamePhase === 'crashed') {
        messageElement.textContent = 'Hai perso la puntata!';
    }

    updateControls();
}

function updateControls() {
    if (gamePhase === 'waiting') {
        playButton.disabled = Boolean(currentBet);
    } else if (gamePhase === 'flight') {
        playButton.disabled =
            !currentBet || currentBet.status !== 'active';
    } else {
        playButton.disabled = true;
    }

    if (balance <= 0 && !currentBet) {
        playButton.disabled = true;
    }
}

function updateHistory(history) {
    if (history.length === 0) {
        historyElement.innerHTML =
            '<p class="muted">Nessun round completato.</p>';
        return;
    }

    historyElement.innerHTML = history.map(round => `
        <div class="history-item">
            <span>Round #${round.roundId}</span>
            <strong>${round.multiplier}</strong>
        </div>
    `).join('');
}

playButton.addEventListener('click', () => {
    if (gamePhase === 'waiting') {
        const amount = Number(betInput.value);

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            messageElement.textContent = 'Inserisci una puntata valida.';
            return;
        }

        send('bet', { amount });
    } else if (gamePhase === 'flight') {
        send('cashout');
    }
});

document.querySelectorAll('[data-amount]').forEach(button => {
    button.addEventListener('click', () => {
        betInput.value = button.dataset.amount;
    });
});

