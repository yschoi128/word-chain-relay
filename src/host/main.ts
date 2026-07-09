import type { WSMessage, Team } from '../shared/types';
import QRCode from 'qrcode';

const $ = (s: string) => document.getElementById(s)!;
const allSections = ['section-lobby', 'section-teams', 'section-round', 'section-chain', 'section-scoreboard', 'section-final'];
function showOnly(...ids: string[]) {
  allSections.forEach(s => $(s).classList.toggle('hidden', !ids.includes(s)));
}

let teams: Team[] = [];
let nicknameMap: Record<string, string> = {};
let completedTeamCount = 0;
let totalTeamCount = 0;

// QR code
async function showQR() {
  const playerUrl = `${location.origin}/player/`;
  $('qr-area').innerHTML = `<p style="font-size:1.1rem;color:#a5b4fc;">QR 코드를 스캔해 접속하세요</p>`;
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, playerUrl, { width: 200, margin: 2 });
    $('qr-area').innerHTML = '';
    $('qr-area').appendChild(canvas);
    // 주소 텍스트는 표시하지 않음(참가자가 주소로 admin 등에 접근하는 것 방지). QR만 노출.
  } catch {
    // QR 생성 실패 시에만 접속 주소를 폴백으로 노출
    $('qr-area').innerHTML = `<p style="font-size:1rem;color:#a5b4fc;word-break:break-all;">${playerUrl}</p>`;
  }
}
showQR();

// WebSocket
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=host`);
  ws.onmessage = (ev) => handleMessage(JSON.parse(ev.data));
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

function handleMessage(msg: WSMessage) {
  switch (msg.type) {
    case 'playerCount':
      $('player-count').textContent = `${msg.count}명 접속`;
      $('player-names').textContent = msg.nicknames.join(', ');
      // Warning #1: 다른 섹션에서도 접속 수 참조 가능하도록 전역 표시 업데이트
      $('global-player-count').textContent = `접속: ${msg.count}명`;
      break;
    case 'teamAssigned':
      teams = msg.teams;
      totalTeamCount = teams.length;
      nicknameMap = msg.nicknameMap;
      showTeams();
      break;
    case 'phaseChange':
      if (msg.phase === 'roundActive') {
        showOnly('section-round');
      }
      break;
    case 'roundStart':
      completedTeamCount = 0;
      $('round-info').textContent = `라운드 ${msg.roundIndex + 1} 진행 중...`;
      $('round-progress').textContent = `0/${totalTeamCount}팀 완료`;
      showOnly('section-round');
      break;
    case 'roundComplete':
      // Warning #3: 팀별 완료 상태 카운트
      completedTeamCount++;
      $('round-progress').textContent = `${completedTeamCount}/${totalTeamCount}팀 완료`;
      break;
    case 'roundResult':
      showChain(msg.results);
      break;
    case 'scoreboard':
      showScoreboard(msg.teams);
      break;
    case 'finalResult':
      showFinal(msg.ranking);
      break;
  }
}

function showTeams() {
  showOnly('section-teams');
  const grid = $('teams-grid');
  grid.innerHTML = '';
  for (const team of teams) {
    const card = document.createElement('div');
    card.className = 'team-card';
    const names = team.playerIds.map(id => nicknameMap[id] ?? id).join(', ');
    card.innerHTML = `<h3>${team.id}팀 (${team.playerIds.length}명)</h3><p style="color:#ccc;font-size:0.85rem;">${names}</p>`;
    grid.appendChild(card);
  }
}

function showChain(results: { teamId: number; guesses: { playerId?: string; word: string; correct: boolean }[]; score: number; targetWord: string }[]) {
  showOnly('section-chain');
  $('chain-title').textContent = `정답: ${results[0]?.targetWord ?? ''}`;
  const list = $('chain-list');
  list.innerHTML = '';
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'chain-item';
    let html = `<span class="team-label">${r.teamId}팀</span>`;
    let solver = '';
    for (const g of r.guesses) {
      const who = g.playerId ? (nicknameMap[g.playerId] ?? '') : '';
      const name = who ? `<span style="color:#94a3b8;font-size:0.8em;">${who}</span> ` : '';
      if (g.word === '') {
        html += `<span class="word arrow" style="color:#888;">${name}(패스)</span>`;
      } else if (g.correct) {
        html += `<span class="word arrow correct">${name}${g.word} ✅</span>`;
        solver = who;
      } else {
        html += `<span class="word arrow">${name}${g.word}</span>`;
      }
    }
    if (solver) html += `<span style="margin-left:8px;color:#4ade80;font-weight:bold;">🎯 ${solver}</span>`;
    html += `<span style="margin-left:auto;font-weight:bold;color:#fbbf24;">+${r.score}</span>`;
    div.innerHTML = html;
    list.appendChild(div);
  }
}

function showScoreboard(scoreData: { teamId: number; totalScore: number; roundScore: number }[]) {
  showOnly('section-scoreboard');
  const body = $('scoreboard-body');
  body.innerHTML = '';
  scoreData.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i + 1}</td><td>${t.teamId}팀</td><td>+${t.roundScore}</td><td>${t.totalScore}</td>`;
    body.appendChild(tr);
  });
}

function showFinal(ranking: { teamId: number; totalScore: number; rank: number }[]) {
  showOnly('section-final');
  // 1위가 여러 팀이면(공동 우승) 모두 표시한다.
  const winners = ranking.filter(r => r.rank === 1);
  const topScore = winners[0]?.totalScore ?? 0;
  if (winners.length === 0) {
    $('final-champion').textContent = '';
  } else if (winners.length === 1) {
    $('final-champion').textContent = `🥇 ${winners[0].teamId}팀 — ${topScore}점`;
  } else {
    $('final-champion').textContent = `🥇 공동 우승 (${winners.length}팀): ${winners.map(w => `${w.teamId}팀`).join(', ')} — ${topScore}점`;
  }
  const body = $('final-body');
  body.innerHTML = '';
  for (const r of ranking) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.rank}위</td><td>${r.teamId}팀</td><td>${r.totalScore}점</td>`;
    body.appendChild(tr);
  }
}
