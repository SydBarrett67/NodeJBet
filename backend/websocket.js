
const WebSocket = require('ws');

const createAviatorEngine = require('./games/aviator/engine');
const createRouletteEngine = require('./games/roulette/engine');

function attachWebSocket(server, sessionMiddleware) {
    const wss = new WebSocket.Server({ noServer: true });
    const clients = new Map();

    function sendToUser(game, userId, data) {
        for (const [ws, info] of clients.entries()) {
            if (
                info.game === game &&
                String(info.userId) === String(userId) &&
                ws.readyState === WebSocket.OPEN
            ) {
                ws.send(JSON.stringify(data));
            }
        }
    }

    function sendToAll(game, data) {
        const message = JSON.stringify(data);

        for (const [ws, info] of clients.entries()) {
            if (
                info.game === game &&
                ws.readyState === WebSocket.OPEN
            ) {
                ws.send(message);
            }
        }
    }

    const aviator = createAviatorEngine(
        data => sendToAll('aviator', data),
        (userId, data) => sendToUser('aviator', userId, data)
    );

    const roulette = createRouletteEngine(
        data => sendToAll('roulette', data),
        (userId, data) => sendToUser('roulette', userId, data)
    );

    server.on('upgrade', (req, socket, head) => {
        const pathname = new URL(
            req.url,
            'http://localhost'
        ).pathname;

        if (pathname !== '/ws' && pathname !== '/roulette-ws') {
            socket.destroy();
            return;
        }

        sessionMiddleware(req, {}, () => {
            if (!req.session || !req.session.user) {
                socket.write(
                    'HTTP/1.1 401 Unauthorized\r\n\r\n'
                );
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, ws => {
                ws.game = pathname === '/ws'
                    ? 'aviator'
                    : 'roulette';

                wss.emit('connection', ws, req);
            });
        });
    });

    wss.on('connection', (ws, req) => {
        const userId = req.session.user.id;
        const game = ws.game;

        clients.set(ws, { userId, game });

        const engine = game === 'aviator'
            ? aviator
            : roulette;

        ws.send(JSON.stringify({
            type: 'state',
            state: engine.getPublicState()
        }));

        engine.handleMessage(userId, {
            action: 'state'
        });

        ws.on('message', rawMessage => {
            try {
                const message = JSON.parse(rawMessage.toString());
                engine.handleMessage(userId, message);
            } catch (error) {
                console.error(
                    `Messaggio ${game} non valido:`,
                    error
                );
            }
        });

        ws.on('close', () => {
            clients.delete(ws);
        });
    });

    console.log('WebSocket Aviator attivo su /ws');
    console.log('WebSocket Roulette attivo su /roulette-ws');
}

module.exports = attachWebSocket;

