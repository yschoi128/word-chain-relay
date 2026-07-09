import type { WSMessage, Team, RoundGuess } from '../shared/types';

const $ = (s: string) => document.getElementById(s)!;
const sections = ['section-join', 'section-lobby', 'section-team', 'section-round', 'section-result', 'section-final'];
function showSection(id: string) {
  sections.forEach(s => $(s).classList.toggle('hidden', s !== id));
}

let playerId = localStorage.getItem('wcr-playerId') || crypto.randomUUID();
localStorage.setItem('wcr-playerId', playerId);

let ws: WebSocket | null = null;
let myTeamId = 0;
let myOrder = 0;
let teams: Team[] = [];
let nicknameMap: Record<string, string> = {};
let timerInterval: ReturnType<typeof setInterval> | null = null;
let currentTurnOrder: string[] = [];

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?role=player&playerId=${playerId}`);
  ws.onmessage = (ev) => {
    const msg: WSMessage = JSON.parse(ev.data);
    handleMessage(msg);
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

function handleMessage(msg: WSMessage) {
  switch (msg.type) {
    case 'playerCount':
      $('lobby-count').textContent = `현재 ${msg.count}명 접속 중`;
      break;
    case 'teamAssigned':
      myTeamId = msg.myTeamId;
      myOrder = msg.myOrder;
      teams = msg.teams;
      nicknameMap = msg.nicknameMap;
      showTeamInfo();
      break;
    case 'phaseChange':
      if (msg.phase === 'roundResult') break; // handled by roundResult msg
      if (msg.phase === 'finalResult') break;
      break;
    case 'roundStart':
      currentTurnOrder = msg.turnOrder;
      showRound(msg.roundIndex, msg.startWord);
      break;
    case 'turnUpdate':
      updateTurn(msg.currentTurnIndex, msg.guesses, msg.timerStart);
      break;
    case 'turnTimeout':
      // handled via turnUpdate
      break;
    case 'roundComplete':
      if (msg.teamId === myTeamId) {
        showRoundResult(msg.score, msg.guesses);
      }
      break;
    case 'roundResult':
      showRoundResultDetails(msg.results);
      break;
    case 'finalResult':
      showFinal(msg.ranking);
      break;
    case 'scoreboard':
      break;
  }
}

// --- Join ---
$('btn-join').addEventListener('click', async () => {
  const nickname = (document.getElementById('input-nickname') as HTMLInputElement).value.trim();
  if (!nickname) return;
  const res = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, nickname }),
  });
  const data = await res.json();
  if (data.success) {
    showSection('section-lobby');
    connectWS();
  } else {
    alert(data.error || '입장 실패');
  }
});

$('input-nickname').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') ($('btn-join') as HTMLButtonElement).click();
});

// --- Team info ---
function showTeamInfo() {
  showSection('section-team');
  $('team-info').textContent = `당신은 ${myTeamId}팀 / 순서: ${myOrder + 1}번째`;
  const team = teams.find(t => t.id === myTeamId);
  if (team) {
    const names = team.playerIds.map(id => nicknameMap[id] ?? id).join(', ');
    $('team-members').textContent = `팀원: ${names}`;
  }
}

// --- Round ---
function showRound(roundIndex: number, startWord: string) {
  showSection('section-round');
  $('round-label').textContent = `라운드 ${roundIndex + 1}`;
  $('start-word').textContent = startWord;
  $('hint-list').innerHTML = '';
  $('timer').textContent = '';
  $('turn-info').textContent = '';
  ($('input-guess') as HTMLInputElement).value = '';
  ($('input-guess') as HTMLInputElement).disabled = true;
  ($('btn-guess') as HTMLButtonElement).disabled = true;
}

function updateTurn(turnIndex: number, guesses: RoundGuess[], timerStart: number) {
  // Update hints
  const list = $('hint-list');
  list.innerHTML = '';
  for (const g of guesses) {
    const who = nicknameMap[g.playerId] ?? `${g.turnIndex + 1}번`;
    const li = document.createElement('li');
    if (g.word === '') {
      li.textContent = `${who}: (시간초과)`;
      li.className = 'timeout';
    } else if (g.correct) {
      li.textContent = `${who}: ${g.word} ✅`;
      li.className = 'correct';
    } else {
      li.textContent = `${who}: ${g.word}`;
    }
    list.appendChild(li);
  }

  // Who's turn?
  const isMyTurn = currentTurnOrder[turnIndex] === playerId;
  if (isMyTurn) {
    $('turn-info').textContent = '🎯 당신의 차례!';
    ($('input-guess') as HTMLInputElement).disabled = false;
    ($('btn-guess') as HTMLButtonElement).disabled = false;
    ($('input-guess') as HTMLInputElement).focus();
  } else {
    $('turn-info').textContent = `${turnIndex + 1}번째 타자 차례입니다`;
    ($('input-guess') as HTMLInputElement).disabled = true;
    ($('btn-guess') as HTMLButtonElement).disabled = true;
  }

  // Timer
  startTimerDisplay(timerStart);
}

function startTimerDisplay(serverStart: number) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - serverStart;
    const remaining = Math.max(0, 15000 - elapsed);
    const sec = Math.ceil(remaining / 1000);
    $('timer').textContent = sec > 0 ? `${sec}초` : '⏱️';
    if (remaining <= 0 && timerInterval) {
      clearInterval(timerInterval);
    }
  }, 200);
}

// --- Guess ---
$('btn-guess').addEventListener('click', submitGuess);
$('input-guess').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') submitGuess();
});

async function submitGuess() {
  const input = document.getElementById('input-guess') as HTMLInputElement;
  const word = input.value.trim();
  if (!word) return;
  input.disabled = true;
  ($('btn-guess') as HTMLButtonElement).disabled = true;

  await fetch('/api/guess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, word }),
  });
  input.value = '';
}

// --- Round result ---
function showRoundResult(score: number, _guesses: RoundGuess[]) {
  // Wait for full roundResult
  void score;
}

function showRoundResultDetails(results: { teamId: number; guesses: RoundGuess[]; score: number; targetWord: string }[]) {
  showSection('section-result');
  const myResult = results.find(r => r.teamId === myTeamId);
  if (myResult) {
    $('result-answer').textContent = `정답: ${myResult.targetWord}`;
    const correct = myResult.guesses.find(g => g.correct);
    const solver = correct ? (nicknameMap[correct.playerId] ?? '') : '';
    $('result-score').textContent = myResult.score > 0
      ? `+${myResult.score}점!${solver ? ` (맞힌 사람: ${solver})` : ''}`
      : '0점...';
  }
  const team = teams.find(t => t.id === myTeamId);
  if (team) {
    const total = team.scores.reduce((a, b) => a + b, 0) + (myResult?.score ?? 0);
    $('result-total').textContent = `누적 ${total}점`;
  }
}

// --- Final ---
function showFinal(ranking: { teamId: number; totalScore: number; rank: number }[]) {
  showSection('section-final');
  const container = $('final-ranking');
  container.innerHTML = '';
  for (const r of ranking) {
    const div = document.createElement('div');
    div.style.cssText = 'padding:8px;border-bottom:1px solid #333;display:flex;justify-content:space-between;';
    const isMe = r.teamId === myTeamId;
    if (isMe) div.style.background = '#1e3a5f';
    div.innerHTML = `<span>${r.rank}위 — ${r.teamId}팀${isMe ? ' ⭐' : ''}</span><span>${r.totalScore}점</span>`;
    container.appendChild(div);
  }
}

// --- Init: check if already joined ---
(async () => {
  const res = await fetch(`/api/status?playerId=${playerId}`);
  const data = await res.json();
  if (data.player) {
    showSection('section-lobby');
    connectWS();
    if (data.nicknameMap) {
      nicknameMap = data.nicknameMap;
    }
    if (data.phase !== 'lobby') {
      if (data.player.teamId !== null) {
        myTeamId = data.player.teamId;
        myOrder = data.player.orderInTeam ?? 0;
        teams = data.teams;
      }
      if (data.phase === 'teamAssigned') {
        showTeamInfo();
      } else if (data.phase === 'roundActive') {
        // Reconnect during active round — show round section.
        // The server will re-send roundStart + turnUpdate via WS upon reconnect.
        showTeamInfo();
        showSection('section-round');
      } else if (data.phase === 'roundResult') {
        showSection('section-result');
      } else if (data.phase === 'finalResult') {
        showSection('section-final');
      }
    }
  }
})();
