I have enough to complete the review. Let me verify one detail about the result-screen flow ordering in `finishRound`.

The flow is confirmed. Here is my review.

# Review Result (Claude Reviewer)
VERDICT: FIX_REQUIRED

## Critical (must fix)
[server/game.ts:382-391] **라운드 결과의 "연상 체인" 화면이 즉시 스코어보드로 덮여 영구히 볼 수 없음** `finishRound`는 한 틱 안에서 `roundResult`(체인)를 broadcast한 직후 곧바로 `scoreboard`도 broadcast한다. 호스트의 `handleMessage`는 `roundResult`→`showChain`(section-chain)을 그린 직후 동기적으로 `scoreboard`→`showScoreboard`(section-scoreboard)로 화면을 교체하므로, 스펙에서 "핵심 볼거리"로 지정한 연상 체인 공개 화면이 매 라운드 한 번도 실제로 표시되지 않는다. Fix: `finishRound`에서는 체인(`roundResult`)만 보내고 스코어보드 자동 전송을 제거해 기본 화면을 체인으로 두고, 스코어보드 전환은 진행자 토글에만 맡긴다.

[server/game.ts:413-425] **진행자의 "체인 보기" 전환이 동작하지 않음** `doShowResult('chain')` 분기는 `// 'chain' → roundResult already sent` 주석만 있고 아무것도 broadcast하지 않는다. 따라서 위 Critical로 스코어보드가 표시된 뒤 진행자가 admin 콘솔의 "체인 보기"(`view:'chain'`)를 눌러도 체인 화면으로 되돌릴 방법이 없다. 스펙 2-4의 "결과 화면 전환 (연상 체인 ↔ 스코어보드)"가 단방향으로만 동작한다. Fix: `doShowResult('chain')`에서 현재 `roundState`의 `getRoundResults(...)`를 다시 `roundResult`로 broadcast하도록 구현.

## Warning
[server/game.ts:394-397] **마지막(10) 라운드의 결과 화면이 통째로 스킵됨** `finishRound`가 `roundResult`/`scoreboard`를 보낸 직후 같은 틱에서 `currentRoundIndex >= TOTAL_ROUNDS`이면 `showFinalResult()`를 호출해 즉시 `finalResult`로 전환한다. 호스트는 10라운드 체인/스코어보드를 보지 못하고 곧바로 최종 결과로 점프한다. 스펙 플로우는 라운드 결과 → (반복) → 최종 결과로 최종 결과를 별도 단계로 본다. Fix: 최종 결과 전환을 자동 호출하지 말고 진행자 액션(예: 마지막 라운드 후 "최종 결과" 버튼)으로 분리.

[server/game.ts:159-166, server/teams.ts:18-21] **인원 6명·7명일 때 미처리 예외로 500 응답** `assignTeams`는 `minTeams > maxTeams`(예: N=6,7 → 4~5명 팀 구성 불가)일 때 `throw`하는데 `doAssignTeams`는 이를 try/catch로 감싸지 않는다. admin 라우터가 그대로 호출하므로 친절한 안내 대신 Express의 일반 500이 반환된다(스펙은 "게임 시작 불가 안내"를 요구). Fix: `doAssignTeams`에서 `assignTeams`를 try/catch로 감싸 `{ success:false, error }`로 변환.

[src/player/main.ts:200-204] **플레이어 라운드 결과의 "누적 점수"가 항상 이번 라운드 점수만 표시** `team.scores`는 `teamAssigned` 시점의 스냅샷(빈 배열 `[]`)이며 이후 갱신되지 않는다. 서버는 `team.scores`를 누적하지만 클라이언트 사본은 그대로라 `team.scores.reduce(...) + myResult.score`는 매번 `0 + 이번점수`가 되어 2라운드부터 누적 표시가 틀린다. Fix: `scoreboard` 메시지의 본인 팀 `totalScore`를 사용하거나 서버가 누적 합을 결과에 포함.

[server/game.ts:65-68] **호스트/진행자 WS 재접속 시 상태 복원 없음** 플레이어는 `/api/status`와 `registerPlayerClient`의 재전송으로 복원되지만, `registerHostClient`는 연결 시 현재 phase/teams/라운드 스냅샷을 전혀 보내지 않는다. 게임 도중 호스트 화면 새로고침/재연결 시 다음 broadcast 전까지 로비 상태로 멈춘다. Fix: 호스트 연결 시 현재 단계에 맞는 스냅샷(teams, 진행/결과)을 즉시 전송.

[server/game.ts:353-358] **활성 라운드 중 완료 팀의 정답 단어가 호스트로 전송됨** `onTeamComplete`의 `broadcast(roundComplete, { guesses })`는 같은 문제를 아직 풀고 있는 다른 팀이 있는 동안에도 완료 팀의 전체 체인(정답 단어 포함)을 호스트(공개 대형 화면)로 내보낸다. 현재 호스트 UI는 카운트만 하지만 데이터는 와이어/콘솔에 노출되어 스펙의 "진행 중 상세 미표시(힌트 유출 방지)"에 위배. Fix: 활성 라운드 중 호스트용 broadcast에서는 `guesses`를 생략하고 완료 카운트만 전달.

## Nit
[server/rounds.ts:3-4] **최대 라운드 시간 스펙 불일치** grace 1초가 매 턴에 더해져 실제 컷오프는 5×16초=80초인데 스펙은 "최대 75초(5×15초)"로 적었다. 의도된 grace라면 스펙/주석을 80초로 정정 권장.

[server/game.ts:225-230] **`replaceNextQuestion`에 단계 가드 없음** 라운드가 진행된 뒤에도 `selected[currentRoundIndex]`를 교체할 수 있다. `phase`/진행 상태 가드 추가 권장.

[server/game.ts:299-322] **`handleTimeout` 후 `turnTimers` 항목 미삭제** 만료된 타이머가 맵에 남는다(이후 `finishRound`에서 일괄 정리되긴 함). housekeeping 차원에서 삭제 권장.

[server/game.ts:413-414] **`doShowResult` 가드가 사실상 무력** `!roundState && ...` 조건은 첫 라운드 이후 `roundState`가 null로 리셋되지 않으므로 거의 항상 통과한다. 의도한 단계 제한이라면 phase 기반으로 재작성 권장.

## Good points
[server/rounds.ts:29-41] 로테이션 + 4명 팀 패딩(첫 타자 마지막 한 번 더) 로직이 스펙과 정확히 일치하고 `tests/rounds.test.ts`로 잘 검증됨.

[server/game.ts:41-49, 117-147] `sendToTeam` 및 `getGameStatus`의 팀별 필터링으로 다른 팀 힌트 유출을 막는 격리가 플레이어 경로에서 올바르게 구현됨.

[server/game.ts:472-490] 서버 권위 타이머 + grace, 단일 스레드 기반의 차례/타이머 원자적 처리로 동시 제출 경합이 안전하게 처리됨(차례 아님/완료 팀 거부).

[server/game.ts:434-445] 최종 순위 동점 처리(총점 → 맞춘 라운드 수, 공동 순위)가 스펙과 일치.
