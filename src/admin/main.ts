import type { WSMessage } from '../shared/types';

const $ = (s: string) => document.getElementById(s)!;

function log(msg: string) {
  const el = $('log');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
}

// WS for status updates
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?role=admin`);
  ws.onmessage = (ev) => {
    const msg: WSMessage = JSON.parse(ev.data);
    if (msg.type === 'playerCount') {
      $('player-count').textContent = `접속 인원: ${msg.count}명`;
    } else if (msg.type === 'phaseChange') {
      $('status').textContent = `상태: ${msg.phase}`;
      log(`Phase → ${msg.phase}`);
    } else if (msg.type === 'roundComplete') {
      log(`팀 ${msg.teamId} 라운드 완료: +${msg.score}점`);
    } else if (msg.type === 'roundResult') {
      log(`라운드 결과 수신 (${msg.results.length}팀)`);
    } else if (msg.type === 'teamAssigned') {
      // 팀 배정 브로드캐스트 → 명단 갱신
      const roster = msg.teams.map((t) => ({
        id: t.id,
        members: t.playerIds.map((pid, i) => ({
          nickname: msg.nicknameMap[pid] ?? '(?)',
          orderInTeam: i,
          left: false,
        })),
      }));
      renderTeams(roster);
      log(`팀 배정 완료 (${roster.length}팀)`);
    }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

// --- Actions ---
$('btn-assign').addEventListener('click', async () => {
  const res = await fetch('/api/admin/assign-teams', { method: 'POST' });
  const data = await res.json();
  if (data.success) log('팀 배정 완료');
  else log(`팀 배정 실패: ${data.error}`);
});

$('btn-reset').addEventListener('click', async () => {
  if (!confirm('게임을 초기화할까요? 모든 플레이어와 점수가 사라집니다.')) return;
  const res = await fetch('/api/admin/reset', { method: 'POST' });
  const data = await res.json();
  if (data.success) log('🔄 게임 초기화 완료');
});

$('btn-start-round').addEventListener('click', async () => {
  const res = await fetch('/api/admin/start-round', { method: 'POST' });
  const data = await res.json();
  if (data.success) log('라운드 시작');
  else log(`라운드 시작 실패: ${data.error}`);
});

$('btn-end-round').addEventListener('click', async () => {
  const res = await fetch('/api/admin/end-round', { method: 'POST' });
  const data = await res.json();
  log(data.success ? '라운드 강제 종료' : '종료 실패');
});

$('btn-show-chain').addEventListener('click', async () => {
  await fetch('/api/admin/show-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ view: 'chain' }),
  });
  log('호스트: 체인 보기');
});

$('btn-show-score').addEventListener('click', async () => {
  await fetch('/api/admin/show-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ view: 'scoreboard' }),
  });
  log('호스트: 스코어보드');
});

$('btn-final').addEventListener('click', async () => {
  if (!confirm('최종 결과(우승팀)를 발표할까요? 호스트 화면에 순위가 표시됩니다.')) return;
  const res = await fetch('/api/admin/final-result', { method: 'POST' });
  const data = await res.json();
  if (data.success) log('🏆 최종 결과 발표');
  else log(`최종 결과 실패: ${data.error}`);
});

$('btn-preview').addEventListener('click', async () => {
  const res = await fetch('/api/admin/preview-question');
  const data = await res.json();
  if (data.question) {
    $('preview').innerHTML = `<strong>출발어:</strong> ${data.question.startWord}<br><strong>목표어:</strong> ${data.question.targetWord}`;
  } else {
    $('preview').textContent = '더 이상 문제가 없습니다';
  }
});

$('btn-replace').addEventListener('click', async () => {
  const res = await fetch('/api/admin/replace-question', { method: 'POST' });
  const data = await res.json();
  if (data.question) {
    $('preview').innerHTML = `<strong>교체됨!</strong><br>출발어: ${data.question.startWord}<br>목표어: ${data.question.targetWord}`;
    log('문제 교체됨');
  } else {
    $('preview').textContent = '교체할 문제가 없습니다';
  }
});

// --- Manual questions ---
$('btn-add-q').addEventListener('click', async () => {
  const startWord = ($('input-start') as HTMLInputElement).value.trim();
  const targetWord = ($('input-target') as HTMLInputElement).value.trim();
  if (!startWord || !targetWord) return;
  const res = await fetch('/api/admin/add-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startWord, targetWord }),
  });
  const data = await res.json();
  if (data.success) {
    ($('input-start') as HTMLInputElement).value = '';
    ($('input-target') as HTMLInputElement).value = '';
    renderManualList(data.questions);
    log(`수동 문제 추가: ${startWord} → ${targetWord}`);
  }
});

async function loadManualQuestions() {
  const res = await fetch('/api/admin/manual-questions');
  const data = await res.json();
  renderManualList(data.questions);
}

function renderManualList(questions: { startWord: string; targetWord: string }[]) {
  const ul = $('manual-list');
  ul.innerHTML = '';
  questions.forEach((q, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${q.startWord} → ${q.targetWord}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '삭제';
    btn.className = 'btn-danger';
    btn.style.cssText = 'padding:4px 8px;font-size:0.8rem;';
    btn.onclick = async () => {
      await fetch('/api/admin/remove-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: i }),
      });
      loadManualQuestions();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

loadManualQuestions();

// --- 팀 명단 ---
type RosterMember = { nickname: string; orderInTeam: number; left: boolean };
type RosterTeam = { id: number; members: RosterMember[] };

function renderTeams(teams: RosterTeam[]) {
  const view = $('teams-view');
  const summary = $('teams-summary');
  if (!teams.length) {
    view.innerHTML =
      '<p style="color:#888;font-size:0.9rem;">팀 배정 후 팀원 명단이 여기에 표시됩니다.</p>';
    summary.textContent = '';
    return;
  }
  const total = teams.reduce((n, t) => n + t.members.length, 0);
  summary.textContent = `· ${teams.length}팀 / ${total}명`;
  view.innerHTML = '';
  for (const t of teams) {
    const box = document.createElement('div');
    box.className = 'team-box';
    const items = t.members
      .map((m) => `<li class="${m.left ? 'left' : ''}">${escapeHtml(m.nickname)}</li>`)
      .join('');
    box.innerHTML = `<h3>팀 ${t.id} <span class="cnt">${t.members.length}명</span></h3><ol>${items}</ol>`;
    view.appendChild(box);
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

async function loadTeams() {
  const res = await fetch('/api/admin/teams');
  const data = await res.json();
  const teams: RosterTeam[] = (data.teams ?? []).map(
    (t: { id: number; members: { nickname: string; orderInTeam: number }[] }) => ({
      id: t.id,
      members: t.members.map((m) => ({
        nickname: m.nickname,
        orderInTeam: m.orderInTeam,
        left: m.nickname === '(퇴장)',
      })),
    }),
  );
  renderTeams(teams);
}

$('btn-teams').addEventListener('click', () => {
  loadTeams();
  log('팀 명단 새로고침');
});

// 페이지 로드 시 이미 배정된 팀이 있으면 표시 (관리자 새로고침 대비)
loadTeams();
