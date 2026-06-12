# Review (Kiro)

VERDICT: FIX_REQUIRED

## Checklist
- [x] 기능 완성도
- [x] 에러 처리
- [x] 파일 구조
- [x] 타입 안전성
- [x] 하드코딩
- [ ] UI/UX 일치 (Warning 항목 참고)
- [x] 의존성
- [x] 보안/성능

## Critical

없음.

## Warning

### 1. 호스트 스크린 — 로비에서 참가자 닉네임 리스트 미표시
- [src/host/main.ts:handleMessage] `playerCount` 메시지 수신 시 `player-names`에 닉네임을 표시하지만, 스펙의 "참가자 닉네임 리스트"가 로비 섹션에만 보이고 팀 배정 후 다시 참조 불가. 기능적으로는 동작하나, 스펙의 §호스트 2-1은 "닉네임 리스트"를 명시하고 있고 이는 충족됨.
- **실질적 문제**: `showOnly`로 `section-teams`를 보여줄 때 `section-lobby`가 숨겨져서 닉네임 리스트와 접속 인원이 사라짐. 진행자가 팀 배정 후에도 인원을 확인하고 싶을 수 있음.
- 해결: `section-lobby` 일부 정보(접속 수)를 teams/round 단계에서도 표시하거나, 현재 로비 정보를 다른 섹션에도 보여주기.

### 2. 플레이어 재접속 시 `nicknameMap` 복원 미완
- [src/player/main.ts:init IIFE] 재접속 시 `/api/status`에서 `teams`를 복원하지만 `nicknameMap`이 전달되지 않음. `showTeamInfo()` 호출 시 팀원 이름이 playerId로 표시됨.
- [server/index.ts:GET /api/status] 응답에 `nicknameMap` 필드가 없음.
- 해결: `/api/status` 응답에 `nicknameMap`을 추가하거나, 재접속 시 별도로 닉네임 정보를 제공.

### 3. 호스트 스크린에서 라운드 진행 시 팀별 완료 상태 미표시
- 스펙 §호스트 2-3: "라운드 N 진행 중... + 타이머 or 진행률" 명시. 현재 구현은 `section-round`에 `라운드 N 진행 중...` 텍스트만 표시하고, 팀별 진행률이나 몇 팀 완료했는지를 보여주지 않음.
- 해결: `roundComplete` 메시지 수신 시 완료 팀 수를 카운트하여 "N/M팀 완료" 텍스트를 `section-round`에 표시.

### 4. 호스트 QR 코드 생성 — CDN dynamic import 의존
- [src/host/main.ts:showQR] `import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm')` 으로 런타임 CDN 의존. `package.json`에 `qrcode`가 이미 dependency로 있지만 Vite 빌드에서 번들링되지 않고 CDN에서 동적 로드.
- 오프라인/방화벽 환경(대회장 네트워크 제한)에서 QR 생성 실패 가능.
- 해결: `import QRCode from 'qrcode'`로 직접 import하여 Vite가 번들링하도록 변경. 이미 dependency에 있으므로 추가 설치 불필요.

### 5. 라운드 자동 종료 후 다음 라운드 전환에 진행자 개입 필수인데 호스트/플레이어에 안내 없음
- 스펙 플로우: 라운드 결과 표시 후 "진행자: 문제 확인 → '라운드 시작' 클릭"으로 다음 라운드 시작. 현재 라운드 결과 후 플레이어는 `section-result`에 머물고 다음 라운드 대기 안내가 없음.
- 해결: `section-result`에 "다음 라운드를 기다리는 중..." 문구 추가.

## Nit

### 1. `src/host/main.ts` — TypeScript에서 CDN ESM import 시 `as any` 사용
- [src/host/main.ts:12] `import('...' as any)` — 불가피하지만 Warning #4 해결 시 자연스럽게 제거됨.

### 2. `server/game.ts` — `questions.json` 읽기를 매 `initQuestions()` 호출 시 동기 I/O
- [server/game.ts:initQuestions] `readFileSync`가 게임 시작 시 한 번만 호출되므로 실질적 문제는 아니나, 초기 로드 시 한 번만 캐싱하면 더 깔끔.

### 3. 스펙의 "빈 문자열 제출" 처리
- 스펙: "빈 문자열 제출 → 무시 (입력 안 한 것으로 취급, 타이머 계속)". 구현에서 서버 `submitGuess`가 빈 입력을 거부(`if (!trimmed)`)하고 에러를 반환. 동작은 동일(타이머 계속)하나 클라이언트도 빈 입력 시 전송 자체를 안 하므로 일치함.

### 4. 로그 파일이 gitignore에 `*.log`로 걸려있으나 `logs/` 디렉토리 자체는 추적됨
- `logs/review-kiro-r1.md`는 `.log` 패턴에 안 걸리므로 추적됨. 의도적일 수 있으나 확인 필요.

### 5. admin 라우트에 인증 없음
- 스펙에서도 "1차는 인증 없이, 경로를 아는 사람만"으로 명시하였으므로 문제 아님. 필요 시 간단한 비밀번호 쿼리 파라미터 추가 가능.

## 잘한 점

- **핵심 로직 완전 구현**: 팀 배정(Fisher-Yates + 균등 분배), 턴 로테이션(4명 팀 첫 타자 반복 포함), 점수 계산, 부채 단순화 최종 순위(동점 시 solvedRounds tiebreaker)까지 스펙 충실.
- **테스트 충실**: teams/rounds/game 통합 총 24개 테스트, 팀 배정 경계값(4, 5, 10, 23, 97, 100명)과 턴 로테이션, 점수 계산을 모두 커버.
- **타입 안전성 우수**: shared types를 서버/클라이언트 양쪽에서 공유, `any` 남용 없음, discriminated union으로 WS 메시지 타입 정의.
- **에러 처리 꼼꼼**: 게임 시작 후 추가 입장 차단, 차례 아닌 플레이어 제출 거부, 서버 기준 타이머(grace period 포함), WS 재연결 로직.
- **파일 구조**: 스펙과 정확히 일치(server/, src/host|player|admin/, tests/, data/).
- **배포 설정 완비**: nixpacks.toml, Vite 멀티 엔트리, proxy 설정.
- **문제 세트**: 스펙의 20문제 모두 정확히 `data/questions.json`에 포함, 수동 문제 추가/교체 기능 완성.
