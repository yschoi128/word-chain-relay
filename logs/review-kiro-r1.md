# Review (Kiro)

VERDICT: FIX_REQUIRED

## Checklist
- [x] 기능 완성도 — 핵심 게임 로직, REST/WS API, 3개 화면 모두 구현됨
- [x] 에러 처리 — 스펙에 명시된 에러 케이스 대부분 커버
- [x] 파일 구조 — 스펙과 일치
- [x] 타입 안전성 — 공유 타입 사용, any 남용 없음
- [x] 하드코딩 — 상수 분리 양호 (TURN_TIME_MS, GRACE_MS, MAX_TURNS, TOTAL_ROUNDS)
- [ ] UI/UX 일치 — 호스트 로비에 참가자 닉네임 리스트 미노출, 팀 편성표에 멤버 이름 미표시
- [x] 의존성 — 스펙에 명시된 것만 사용 (express, ws, qrcode, vite, vitest, tsx)
- [x] 보안/성능 — 정답 서버측 판정, 팀별 WS 격리, 턴 검증 정상

## Critical

없음.

## Warning

- [server/game.ts:170] **동점 타이브레이커 로직이 스펙과 불일치할 가능성.**
  스펙: "동점 시 처리: 먼저 맞춘 라운드 수가 많은 팀 우선". 구현: `t.scores.filter(s => s === 5).length` — 5점(1번 타자가 맞춘) 라운드만 카운트. 스펙의 "먼저 맞춘 라운드 수"는 "정답을 맞춘 라운드 수 (score > 0)"로 해석하는 것이 더 자연스럽다.
  **해결 방향**: `t.scores.filter(s => s > 0).length`로 변경하고, 그래도 동점이면 공동 순위 처리.

- [src/host/main.ts] **호스트 로비에 참가자 닉네임 리스트 미노출.** 스펙 §2-1(호스트 로비): "참가자 닉네임 리스트" 표시 명시. HTML에 `#player-names` div가 있으나 JS에서 갱신하지 않음. `playerCount` WS 메시지에 닉네임 배열이 포함되지 않아 표시 불가.
  **해결 방향**: (1) `playerCount` WS 메시지에 `nicknames: string[]` 필드 추가, 또는 별도 `/api/players` GET 엔드포인트 추가. (2) host main.ts에서 수신 시 `#player-names`에 렌더링.

- [src/host/main.ts:showTeams()] **팀 편성표에 멤버 이름 미표시.** 스펙 §2-2(호스트 팀 배정 결과): "20팀 전체 편성표 (팀번호 + 멤버 이름들)". 구현은 `${team.playerIds.length}명 배정`만 표시하고 이름을 보여주지 않음.
  **해결 방향**: `teamAssigned` WS 메시지에 플레이어 ID→닉네임 맵을 포함하거나, Team 타입에 닉네임 정보를 추가하여 호스트에서 이름을 표시.

## Nit

- [src/host/main.ts:12] QR 코드 생성을 CDN `import()`로 런타임 동적 로드. 빌드 시 번들에 포함되지 않아 오프라인 환경에서 QR 미표시(URL 텍스트 폴백은 존재). `qrcode` 패키지가 dependencies에 있으므로 서버에서 SVG/data URL로 생성해 내려주거나, vite 번들에 포함시키는 것이 안정적.

- [server/game.ts:56] `broadcastAll` 함수에서 `hostClients`와 `playerClients` 모두에 동일 메시지를 보냄. `teamAssigned` 등 일부 메시지는 호스트/플레이어에 다른 내용을 보내야 해서 따로 처리하고 있지만, `phaseChange`는 broadcastAll로 전송. 의도에 맞으나, 호스트가 불필요한 turnUpdate 등을 받을 수 있는 구조는 아닌지 확인 필요 (현재는 문제없음).

- [src/player/main.ts] 팀 배정 후 팀원 닉네임을 표시하지 않고 `${team.playerIds.length}명`만 표시. 스펙 §1-2: "팀원 이름 리스트 표시" 요구. 이는 Warning 항목과 동일 근본 원인(Team에 닉네임 정보 부재).

- [server/index.ts:36] `res.json({ success: false, error: '이미 게임이 시작되었습니다' })` — HTTP status가 200으로 반환됨. 일관성을 위해 4xx 사용 또는 클라이언트가 `success` 필드로 구분하는 패턴을 명확히 통일.

## 잘한 점

- 핵심 게임 로직(팀 배정, 턴 로테이션, 4명 팀 처리, 타이머, 점수 계산)이 스펙과 정확히 일치하며 24개 테스트로 커버됨.
- 서버 측 타이머 + grace period로 네트워크 지연 보상 구현.
- WS 격리(팀별 전송)로 타 팀 힌트 유출 방지.
- 재접속 처리(`/api/status` + 기존 플레이어 확인).
- 진행자 콘솔의 문제 관리(수동 추가/삭제/교체/미리보기) 완전 구현.
- 소수결 프로젝트와 동일한 배포 구조(nixpacks.toml)로 Railway 즉시 배포 가능.
- `tsc --noEmit` 통과, Vitest 24개 전체 통과.
