import { WebSocket } from 'ws';
import { GamePhase, Team, Question, RoundState, WSMessage, RoundGuess, RoundResultEntry } from '../src/shared/types.js';
import { getAllPlayers, getPlayer, resetPlayers } from './players.js';
import { assignTeams, shuffle } from './teams.js';
import { createRoundState, getTurnOrder, checkAnswer, calculateScore, isRoundComplete, getRoundResults, TURN_TIME_MS, GRACE_MS, MAX_TURNS, TOTAL_ROUNDS } from './rounds.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- State ---
let phase: GamePhase = 'lobby';
let teams: Team[] = [];
let roundState: RoundState | null = null;
let currentRoundIndex = 0;

// Questions
interface GameQuestions {
  manual: Question[];
  pool: Question[];
  selected: Question[];
}
let gameQuestions: GameQuestions = { manual: [], pool: [], selected: [] };

// Last round results (for doShowResult('chain') re-broadcast)
let lastRoundResults: RoundResultEntry[] | null = null;

// Timers per team
const turnTimers = new Map<number, NodeJS.Timeout>();

// WS clients
const hostClients = new Set<WebSocket>();
const playerClients = new Map<string, WebSocket>(); // playerId → ws

// --- Broadcast ---
function broadcast(msg: WSMessage) {
  const data = JSON.stringify(msg);
  for (const ws of hostClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function sendToTeam(teamId: number, msg: WSMessage) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;
  const data = JSON.stringify(msg);
  for (const pid of team.playerIds) {
    const ws = playerClients.get(pid);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function sendToPlayer(playerId: string, msg: WSMessage) {
  const ws = playerClients.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastAll(msg: WSMessage) {
  broadcast(msg);
  const data = JSON.stringify(msg);
  for (const ws of playerClients.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// --- Public API ---
export function registerHostClient(ws: WebSocket) {
  hostClients.add(ws);
  ws.on('close', () => hostClients.delete(ws));
}

export function registerPlayerClient(playerId: string, ws: WebSocket) {
  playerClients.set(playerId, ws);
  ws.on('close', () => {
    if (playerClients.get(playerId) === ws) playerClients.delete(playerId);
  });

  // Reconnection: re-send current round state if a round is active
  if (phase === 'roundActive' && roundState) {
    const player = getPlayer(playerId);
    if (player && player.teamId !== null) {
      const team = teams.find(t => t.id === player.teamId);
      if (team) {
        const turnOrder = getTurnOrder(team, roundState.roundIndex);
        sendToPlayer(playerId, {
          type: 'roundStart',
          roundIndex: roundState.roundIndex,
          startWord: roundState.question.startWord,
          turnOrder,
        });
        const progress = roundState.teamProgress.get(team.id);
        if (progress && !progress.completed) {
          sendToPlayer(playerId, {
            type: 'turnUpdate',
            teamId: team.id,
            currentTurnIndex: progress.currentTurnIndex,
            guesses: progress.guesses,
            timerStart: progress.timerStart ?? Date.now(),
          });
        }
      }
    }
  }
}

export function getPhase(): GamePhase {
  return phase;
}

export function getTeams(): Team[] {
  return teams;
}

export function notifyPlayerJoined() {
  const players = getAllPlayers();
  broadcastAll({ type: 'playerCount', count: players.length, nicknames: players.map(p => p.nickname) });
}

export function getGameStatus(requestingPlayerId?: string) {
  const players = getAllPlayers();
  const nicknameMap: Record<string, string> = {};
  for (const p of players) {
    nicknameMap[p.id] = p.nickname;
  }

  let roundStatus: object | null = null;
  if (roundState) {
    // During roundActive, only expose the requesting player's own team progress
    // to prevent hint leakage across teams playing the same question.
    const requestingPlayer = requestingPlayerId ? getPlayer(requestingPlayerId) : null;
    const filteredEntries = [...roundState.teamProgress.entries()]
      .filter(([teamId]) => {
        if (phase !== 'roundActive') return true;
        return requestingPlayer?.teamId === teamId;
      })
      .map(([k, v]) => [k, {
        currentTurnIndex: v.currentTurnIndex,
        guesses: v.guesses,
        completed: v.completed,
        score: v.score,
        timerStart: v.timerStart,
      }]);

    roundStatus = {
      roundIndex: roundState.roundIndex,
      startWord: roundState.question.startWord,
      teamProgress: Object.fromEntries(filteredEntries),
    };
  }

  return {
    phase,
    teams,
    nicknameMap,
    currentRoundIndex,
    roundState: roundStatus,
  };
}

// --- Admin actions ---
export function doAssignTeams(): { success: boolean; error?: string } {
  const players = getAllPlayers();
  if (players.length < 4) return { success: false, error: '최소 4명이 필요합니다' };
  if (phase !== 'lobby') return { success: false, error: '이미 게임이 시작되었습니다' };

  teams = assignTeams(players);
  phase = 'teamAssigned';
  initQuestions();

  // Build nickname map for UI display
  const nicknameMap: Record<string, string> = {};
  for (const p of players) {
    nicknameMap[p.id] = p.nickname;
  }

  broadcastAll({ type: 'phaseChange', phase });

  // Send team info to each player individually
  for (const player of players) {
    if (player.teamId !== null && player.orderInTeam !== null) {
      sendToPlayer(player.id, {
        type: 'teamAssigned',
        teams,
        myTeamId: player.teamId,
        myOrder: player.orderInTeam,
        nicknameMap,
      });
    }
  }
  // Host gets all teams
  broadcast({ type: 'teamAssigned', teams, myTeamId: 0, myOrder: 0, nicknameMap });

  return { success: true };
}

function initQuestions() {
  const raw = readFileSync(join(__dirname, '../data/questions.json'), 'utf-8');
  const allQuestions: Question[] = JSON.parse(raw);
  const pool = shuffle([...allQuestions]);

  const manualCount = gameQuestions.manual.length;
  const needed = TOTAL_ROUNDS - manualCount;
  const fromPool = pool.slice(0, needed);

  gameQuestions.pool = pool.slice(needed);
  gameQuestions.selected = [...gameQuestions.manual, ...fromPool];
}

export function addManualQuestion(q: Question) {
  gameQuestions.manual.push(q);
}

export function removeManualQuestion(index: number) {
  gameQuestions.manual.splice(index, 1);
}

export function getManualQuestions(): Question[] {
  return gameQuestions.manual;
}

export function previewNextQuestion(): Question | null {
  if (currentRoundIndex >= TOTAL_ROUNDS) return null;
  if (!gameQuestions.selected.length) initQuestions();
  return gameQuestions.selected[currentRoundIndex] ?? null;
}

export function replaceNextQuestion(): Question | null {
  if (gameQuestions.pool.length === 0) return null;
  const replacement = gameQuestions.pool.shift()!;
  gameQuestions.selected[currentRoundIndex] = replacement;
  return replacement;
}

export function doStartRound(): { success: boolean; error?: string } {
  if (phase !== 'teamAssigned' && phase !== 'roundResult') {
    return { success: false, error: '라운드를 시작할 수 없는 상태입니다' };
  }
  if (currentRoundIndex >= TOTAL_ROUNDS) {
    return { success: false, error: '모든 라운드가 끝났습니다' };
  }

  const question = gameQuestions.selected[currentRoundIndex];
  if (!question) return { success: false, error: '문제가 없습니다' };

  roundState = createRoundState(currentRoundIndex, question, teams);
  phase = 'roundActive';

  broadcastAll({ type: 'phaseChange', phase });

  // Send roundStart to each team (with their turn order)
  for (const team of teams) {
    const turnOrder = getTurnOrder(team, currentRoundIndex);
    sendToTeam(team.id, {
      type: 'roundStart',
      roundIndex: currentRoundIndex,
      startWord: question.startWord,
      turnOrder,
    });
    // Start first turn timer
    startTurnTimer(team.id);
  }

  // Host gets generic roundStart
  broadcast({
    type: 'roundStart',
    roundIndex: currentRoundIndex,
    startWord: question.startWord,
    turnOrder: [],
  });

  return { success: true };
}

function startTurnTimer(teamId: number) {
  if (!roundState) return;
  const progress = roundState.teamProgress.get(teamId);
  if (!progress || progress.completed) return;

  const now = Date.now();
  progress.timerStart = now;

  // Notify team of turn update
  sendToTeam(teamId, {
    type: 'turnUpdate',
    teamId,
    currentTurnIndex: progress.currentTurnIndex,
    guesses: progress.guesses,
    timerStart: now,
  });

  // Clear existing timer
  const existing = turnTimers.get(teamId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    handleTimeout(teamId);
  }, TURN_TIME_MS + GRACE_MS);
  turnTimers.set(teamId, timer);
}

function handleTimeout(teamId: number) {
  if (!roundState) return;
  const progress = roundState.teamProgress.get(teamId);
  if (!progress || progress.completed) return;

  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  const turnOrder = getTurnOrder(team, roundState.roundIndex);
  const playerId = turnOrder[progress.currentTurnIndex];

  // 패스 처리 (빈 guess, 힌트에 추가되지 않음)
  const guess: RoundGuess = {
    playerId,
    word: '',
    correct: false,
    turnIndex: progress.currentTurnIndex,
  };
  progress.guesses.push(guess);

  sendToTeam(teamId, { type: 'turnTimeout', teamId, turnIndex: progress.currentTurnIndex });

  advanceTurn(teamId);
}

function advanceTurn(teamId: number) {
  if (!roundState) return;
  const progress = roundState.teamProgress.get(teamId);
  if (!progress) return;

  progress.currentTurnIndex++;

  if (progress.currentTurnIndex >= MAX_TURNS) {
    // All turns used, no one got it
    progress.completed = true;
    progress.score = 0;
    onTeamComplete(teamId);
  } else {
    startTurnTimer(teamId);
  }
}

function onTeamComplete(teamId: number) {
  if (!roundState) return;
  const progress = roundState.teamProgress.get(teamId);
  if (!progress) return;

  sendToTeam(teamId, {
    type: 'roundComplete',
    teamId,
    score: progress.score,
    guesses: progress.guesses,
  });

  broadcast({
    type: 'roundComplete',
    teamId,
    score: progress.score,
    guesses: progress.guesses,
  });

  if (isRoundComplete(roundState)) {
    finishRound();
  }
}

function finishRound() {
  if (!roundState) return;

  // Clear all timers
  for (const timer of turnTimers.values()) clearTimeout(timer);
  turnTimers.clear();

  // Record scores
  for (const team of teams) {
    const progress = roundState.teamProgress.get(team.id);
    team.scores.push(progress?.score ?? 0);
  }

  const results = getRoundResults(roundState);
  lastRoundResults = results;
  phase = 'roundResult';
  currentRoundIndex++;

  broadcastAll({ type: 'phaseChange', phase });
  broadcastAll({ type: 'roundResult', results });
}

export function doEndRound(): { success: boolean } {
  if (phase !== 'roundActive' || !roundState) return { success: false };

  // Force complete all incomplete teams
  for (const [teamId, progress] of roundState.teamProgress.entries()) {
    if (!progress.completed) {
      progress.completed = true;
      progress.score = 0;
    }
  }
  finishRound();
  return { success: true };
}

export function doShowResult(view: 'chain' | 'scoreboard') {
  if (!roundState && phase !== 'roundResult' && phase !== 'finalResult') return;

  if (view === 'scoreboard') {
    const scoreboard = teams.map(t => ({
      teamId: t.id,
      totalScore: t.scores.reduce((a, b) => a + b, 0),
      roundScore: t.scores[t.scores.length - 1] ?? 0,
    })).sort((a, b) => b.totalScore - a.totalScore);
    broadcastAll({ type: 'scoreboard', teams: scoreboard });
  } else if (view === 'chain') {
    if (lastRoundResults) {
      broadcastAll({ type: 'roundResult', results: lastRoundResults });
    }
  }
}

function showFinalResult() {
  phase = 'finalResult';

  const ranked = teams.map(t => ({
    teamId: t.id,
    totalScore: t.scores.reduce((a, b) => a + b, 0),
    solvedRounds: t.scores.filter(s => s > 0).length,
  })).sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return b.solvedRounds - a.solvedRounds;
  });

  let currentRank = 1;
  const ranking = ranked.map((t, i) => {
    if (i > 0 && (t.totalScore !== ranked[i - 1].totalScore || t.solvedRounds !== ranked[i - 1].solvedRounds)) {
      currentRank = i + 1;
    }
    return { teamId: t.teamId, totalScore: t.totalScore, rank: currentRank };
  });

  broadcastAll({ type: 'phaseChange', phase });
  broadcastAll({ type: 'finalResult', ranking });
}

// --- Reset ---
export function doReset() {
  for (const timer of turnTimers.values()) clearTimeout(timer);
  turnTimers.clear();
  phase = 'lobby';
  teams = [];
  roundState = null;
  currentRoundIndex = 0;
  gameQuestions = { manual: [], pool: [], selected: [] };
  lastRoundResults = null;
  resetPlayers();
  broadcastAll({ type: 'phaseChange', phase });
}

// --- Player guess ---
export function submitGuess(playerId: string, word: string): { success: boolean; error?: string } {
  if (phase !== 'roundActive' || !roundState) {
    return { success: false, error: '라운드 진행 중이 아닙니다' };
  }

  const trimmed = word.trim();
  if (!trimmed) return { success: false, error: '빈 입력' };

  const player = getPlayer(playerId);
  if (!player || player.teamId === null) return { success: false, error: '팀 미배정' };

  const team = teams.find(t => t.id === player.teamId);
  if (!team) return { success: false, error: '팀 없음' };

  const progress = roundState.teamProgress.get(team.id);
  if (!progress || progress.completed) return { success: false, error: '이미 완료된 팀' };

  const turnOrder = getTurnOrder(team, roundState.roundIndex);
  const currentPlayerId = turnOrder[progress.currentTurnIndex];
  if (currentPlayerId !== playerId) return { success: false, error: '차례가 아닙니다' };

  // Check timer (server-side cutoff)
  if (progress.timerStart && Date.now() - progress.timerStart > TURN_TIME_MS + GRACE_MS) {
    return { success: false, error: '시간 초과' };
  }

  const correct = checkAnswer(trimmed, roundState.question.targetWord);
  const guess: RoundGuess = {
    playerId,
    word: trimmed,
    correct,
    turnIndex: progress.currentTurnIndex,
  };
  progress.guesses.push(guess);

  // Clear timer
  const timer = turnTimers.get(team.id);
  if (timer) clearTimeout(timer);
  turnTimers.delete(team.id);

  if (correct) {
    progress.completed = true;
    progress.score = calculateScore(progress.currentTurnIndex);
    onTeamComplete(team.id);
  } else {
    advanceTurn(team.id);
  }

  return { success: true };
}
