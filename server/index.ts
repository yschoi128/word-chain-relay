import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import adminRouter from './admin.js';
import { registerHostClient, registerPlayerClient, submitGuess, notifyPlayerJoined, getGameStatus, getPhase } from './game.js';
import { addPlayer, getPlayer, getPlayerCount } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

// Static files (built frontend)
app.use('/host', express.static(join(__dirname, '../dist/src/host')));
app.use('/player', express.static(join(__dirname, '../dist/src/player')));
app.use('/admin', express.static(join(__dirname, '../dist/src/admin')));
app.use('/assets', express.static(join(__dirname, '../dist/assets')));

// API routes
app.use('/api/admin', adminRouter);

app.post('/api/join', (req, res) => {
  const { playerId, nickname } = req.body as { playerId: string; nickname: string };
  if (!playerId || !nickname) {
    res.status(400).json({ success: false, error: 'Missing playerId or nickname' });
    return;
  }
  const cleaned = nickname.trim().slice(0, 10);
  if (!cleaned) {
    res.status(400).json({ success: false, error: '닉네임을 입력하세요' });
    return;
  }

  if (getPhase() !== 'lobby') {
    const existing = getPlayer(playerId);
    if (!existing) {
      res.json({ success: false, error: '이미 게임이 시작되었습니다' });
      return;
    }
    res.json({ success: true, player: existing });
    return;
  }

  const existing = getPlayer(playerId);
  if (existing) {
    res.json({ success: true, player: existing });
    return;
  }

  const player = addPlayer(playerId, cleaned);
  notifyPlayerJoined();
  res.json({ success: true, player });
});

app.post('/api/guess', (req, res) => {
  const { playerId, word } = req.body as { playerId: string; word: string };
  if (!playerId || word === undefined) {
    res.status(400).json({ success: false, error: 'invalid request' });
    return;
  }
  const result = submitGuess(playerId, word);
  res.json(result);
});

app.get('/api/status', (req, res) => {
  const playerId = req.query.playerId as string;
  const player = playerId ? getPlayer(playerId) : undefined;
  const status = getGameStatus(playerId);
  res.json({ ...status, player: player ?? null });
});

// WebSocket
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const playerId = url.searchParams.get('playerId');

  if (role === 'host' || role === 'admin') {
    registerHostClient(ws);
  } else if (playerId) {
    registerPlayerClient(playerId, ws);
  } else {
    registerHostClient(ws);
  }
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
