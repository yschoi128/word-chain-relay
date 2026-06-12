# Review (Kiro)
VERDICT: LGTM

## Checklist
- [x] 기능 완성도 — 스펙의 모든 핵심 기능 구현됨
- [x] 에러 처리 — 스펙 명시 에러 케이스 모두 처리됨
- [x] 파일 구조 — 스펙 정의 구조와 일치
- [x] 타입 안전성 — any 남용 없음, 공유 타입 적절히 활용
- [x] 하드코딩 — 상수 분리 양호 (TURN_TIME_MS, GRACE_MS, MAX_TURNS, TOTAL_ROUNDS)
- [x] UI/UX 일치 — 플레이어/호스트/어드민 3화면 스펙 충족
- [x] 의존성 — 스펙에 명시된 것만 사용 (express, ws, qrcode, vite, vitest, tsx, typescript)
- [x] 보안/성능 — 정답 서버 판정, 팀 격리, 타이머 서버 기준 등 양호

## Critical
없음.

## Warning
없음.

## Nit
- [server/game.ts:1] `qrcode` import가 서버 코드에 없고 host/main.ts 클라이언트에서만 사용됨 — 의도적이고 정상이나, 서버 package.json에 dependencies로 포함되어 빌드 시 번들에 포함될 수 있음. 클라이언트 전용이면 devDependencies로 이동 고려.
- [src/player/main.ts:88] `showRoundResult` 함수가 결과 표시를 `roundResult` 메시지로 위임하고 score 인자를 `void score`로 버림 — 현재 동작에 문제는 없지만 사용하지 않는 파라미터 경고 제거를 위해 `_score`로 네이밍하는 편이 깔끔.
- [src/host/main.ts] `showOnly` 함수가 복수 id를 인자로 받게 되어 있으나 항상 1개만 전달됨 — 유연성 제공용이라 문제 아님, rest parameter 의도를 주석으로 남기면 좋음.
- [server/game.ts:147] `initQuestions()`에서 `gameQuestions.selected`에 manual 문제가 앞, pool이 뒤로 배치됨 — 스펙은 "수동 문제가 먼저 소진된 뒤 랜덤으로 채움"이라 정확히 일치하지만, 수동 문제가 중간 라운드에 위치할 수 없는 제약이 있음. 스펙상 명시되지 않은 부분이라 nit 수준.
- [data/questions.json] 20문제 모두 스펙 예시와 1:1 동일 — 의도적, 좋음.

## 잘한 점
- **스펙 충실도 높음**: 팀 배정 알고리즘(5명 기준, 4명 팀 5턴 처리), 로테이션, 점수 체계, 동점 처리(solvedRounds tiebreaker)까지 정확히 구현.
- **테스트 커버리지**: teams, rounds, game integration 테스트 24개 모두 통과. 4명 팀 케이스, 97명/100명 배정, tiebreaker 등 엣지 케이스 포함.
- **에러 처리 충실**: 게임 시작 후 입장 거부, 빈 입력 무시, 차례 아닌 사람 제출 거부, 시간초과 판정, 최소 인원 검증 등 스펙 에러 케이스 전부 처리.
- **재접속 지원**: `/api/status`로 현재 상태 복원 + WS reconnect(2초 재시도) 구현.
- **통신 설계**: 스펙대로 REST(join/guess) + WS(상태 push), 팀별 격리(sendToTeam), 호스트 전체 브로드캐스트 분리.
- **Admin 콘솔 풍부**: 팀 배정, 라운드 시작/강제종료, 문제 미리보기/교체, 수동 문제 CRUD, 로그 — 스펙 요구사항 전부 충족.
- **배포 준비 완료**: nixpacks.toml, vite 멀티엔트리 빌드, Railway 배포 가능 상태.
- **타입 안전**: 공유 types.ts로 서버/클라이언트 타입 일관성 유지, `as` 캐스팅 최소화.
