import WebSocket from 'ws';

const BASE = 'https://word-chain-relay-production.up.railway.app';
const WS_URL = 'wss://word-chain-relay-production.up.railway.app/ws';
const PLAYER_COUNT = 99;

const players = [];
const playerWs = new Map();

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 1. Join players
async function joinPlayers() {
  console.log(`[1/5] ${PLAYER_COUNT}명 참여 중...`);
  const promises = [];
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const id = `bot-${i}`;
    const nickname = `봇${i}`;
    promises.push(api('POST', '/api/join', { playerId: id, nickname }).then(r => {
      players.push({ id, nickname });
    }));
  }
  await Promise.all(promises);
  console.log(`   ✓ ${players.length}명 참여 완료`);
}

// 2. Connect WebSockets
async function connectWs() {
  console.log(`[2/5] WebSocket 연결 중...`);
  let connected = 0;
  await new Promise((resolve) => {
    for (const p of players) {
      const ws = new WebSocket(`${WS_URL}?playerId=${p.id}`);
      playerWs.set(p.id, ws);
      ws.on('open', () => {
        connected++;
        if (connected === players.length) resolve();
      });
      ws.on('error', (e) => console.error(`  WS error ${p.id}:`, e.message));
    }
    // Timeout fallback
    setTimeout(() => { console.log(`   (${connected}/${players.length} 연결됨, 계속 진행)`); resolve(); }, 10000);
  });
  console.log(`   ✓ ${connected}개 WebSocket 연결`);
}

// 3. Assign teams
async function assignTeams() {
  console.log(`[3/5] 팀 배정...`);
  const result = await api('POST', '/api/admin/assign-teams');
  if (!result.success) {
    console.error('   ✗ 팀 배정 실패:', result.error);
    return false;
  }
  console.log(`   ✓ 팀 배정 완료`);
  return true;
}

// 4. Play rounds
async function playRounds() {
  console.log(`[4/5] 라운드 진행...`);
  
  for (let round = 0; round < 10; round++) {
    // Preview question to know targetWord
    const preview = await api('GET', '/api/admin/preview-question');
    const targetWord = preview.question?.targetWord;

    // Start round
    const startResult = await api('POST', '/api/admin/start-round');
    if (!startResult.success) {
      console.log(`   라운드 ${round + 1} 시작 실패: ${startResult.error}`);
      break;
    }
    console.log(`   라운드 ${round + 1} 시작 (출발: ${preview.question?.startWord}, 정답: ${targetWord})`);
    
    await sleep(1000);

    // Get status to find teams and turn info
    const status = await api('GET', '/api/status');
    const teams = status.teams || [];

    // For each team, submit guesses for current turns
    for (const team of teams) {
      // Try to guess - some correct, some wrong for realism
      for (let turn = 0; turn < 5; turn++) {
        const turnPlayerIdx = (round + turn) % team.playerIds.length;
        const playerId = team.playerIds[turnPlayerIdx];
        
        // 70% chance correct on turn 2-3, always correct on turn 4
        let word;
        if (turn < 2 && Math.random() > 0.3) {
          word = '틀린답' + Math.random().toString(36).slice(2, 5);
        } else {
          word = targetWord;
        }

        const guessResult = await api('POST', '/api/guess', { playerId, word });
        if (guessResult.success) {
          // If correct, team is done
          if (word === targetWord) break;
        }
        await sleep(100);
      }
    }
    
    // Wait for round to complete
    await sleep(2000);
    
    // Show results
    await api('POST', '/api/admin/show-result', { view: 'chain' });
    await sleep(500);
    await api('POST', '/api/admin/show-result', { view: 'scoreboard' });
    await sleep(500);
    
    console.log(`   ✓ 라운드 ${round + 1} 완료`);
  }
}

// 5. Cleanup
async function cleanup() {
  console.log(`[5/5] 정리...`);
  for (const ws of playerWs.values()) {
    ws.close();
  }
  console.log(`   ✓ 완료!`);
}

// Main
async function main() {
  console.log('=== Word Chain Relay 부하 테스트 (99명) ===\n');
  console.log(`서버: ${BASE}\n`);
  
  try {
    await joinPlayers();
    await connectWs();
    const ok = await assignTeams();
    if (!ok) return;
    await playRounds();
  } catch (e) {
    console.error('에러:', e.message);
  } finally {
    await cleanup();
  }
}

main();
