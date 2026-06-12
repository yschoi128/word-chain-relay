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
  $('qr-area').innerHTML = `<p style="font-size:1.2rem;word-break:break-all;color:#a5b4fc;">${playerUrl}</p>`;
  try {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, playerUrl, { width: 200, margin: 2 });
    $('qr-area').innerHTML = '';
    $('qr-area').appendChild(canvas);
    const urlP = document.createElement('p');
    urlP.style.cssText = 'margin-top:8px;font-size:0.9rem;color:#888;';
    urlP.textContent = playerUrl;
    $('qr-area').appendChild(urlP);
  } catch {
    // fallback: just URL text
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

function showChain(results: { teamId: number; guesses: { word: string; correct: boolean }[]; score: number; targetWord: string }[]) {
  showOnly('section-chain');
  $('chain-title').textContent = `정답: ${results[0]?.targetWord ?? ''}`;
  const list = $('chain-list');
  list.innerHTML = '';
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'chain-item';
    let html = `<span class="team-label">${r.teamId}팀</span>`;
    for (const g of r.guesses) {
      if (g.word === '') {
        html += `<span class="word arrow" style="color:#888;">(패스)</span>`;
      } else if (g.correct) {
        html += `<span class="word arrow correct">${g.word} ✅</span>`;
      } else {
        html += `<span class="word arrow">${g.word}</span>`;
      }
    }
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
  const champion = ranking[0];
  $('final-champion').textContent = champion ? `🥇 ${champion.teamId}팀 — ${champion.totalScore}점` : '';
  const body = $('final-body');
  body.innerHTML = '';
  for (const r of ranking) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.rank}위</td><td>${r.teamId}팀</td><td>${r.totalScore}점</td>`;
    body.appendChild(tr);
  }
}
