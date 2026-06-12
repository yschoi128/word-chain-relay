I now have a complete picture of the codebase and its domain. Let me write the review.

Inferred domain: a real-time team relay word-guessing game with server-authoritative turn/timer logic, team isolation for anti-cheat, and a strict lifecycle (lobby → teamAssigned → roundActive → roundResult → finalResult). Riskiest areas: turn-order rotation (esp. 4-person teams), timer/concurrency, round lifecycle transitions, team isolation (hint leakage), and reconnection. I focused my hunt there.

# Review Result (Claude Reviewer)
VERDICT: FIX_REQUIRED

## Critical (must fix)
[server/game.ts:103] **`/api/status` leaks every team's live guess chain, breaking the explicit anti-cheat isolation rule.** `getGameStatus()` serializes `roundState.teamProgress` for *all* teams (each team's `guesses` array), and `server/index.ts:69` returns it to any caller of `GET /api/status?playerId=…`. Since every team plays the *same* question each round, a player can poll this endpoint and read a leading team's `guesses` to copy their associations — exactly what the spec forbids ("turnUpdate에 다른 팀 정보 미포함", "다른 팀 진행 상황은 안 보여줌 — 힌트 유출 방지"). The WebSocket path is correctly isolated via `sendToTeam`, but the REST status endpoint is not. Fix: in `getGameStatus`, only include the requesting player's own team progress (pass `playerId` through and filter `teamProgress` to that team); never serialize other teams' `guesses` during `roundActive`.

[src/player/main.ts:233] **Reconnection during an active round does not restore play state, so a reconnecting player silently misses their turn.** The spec requires "재접속 시 현재 상태 복원". The init block only handles `teamAssigned` and `finalResult`; for `roundActive`/`roundResult` it falls through and the player is stuck on `section-lobby`. Worse, the WS-only reconnect path (`ws.onclose → connectWS`, game.ts:70) re-registers the socket but the server never re-sends the current `turnUpdate`/`roundStart`, and `currentTurnOrder` is never restored — so a player whose phone locks mid-round comes back unable to see whose turn it is or submit, and gets auto-passed (turnIndex consumed → score lost). In a 100-person mobile contest this is near-certain to occur. Fix: on reconnect, have the server push the current `roundStart`+`turnUpdate` for the player's team (or include `turnOrder`/`currentTurnIndex` in `/api/status` and render the round section for `roundActive`).

## Warning
[server/teams.ts:16] **`assignTeams` can produce teams smaller than 4, violating the "최소 4명/팀" rule, and the round engine then misbehaves.** The guard only checks total `n < 4`. With `n = 6` → `teamCount=2, baseSize=3` → `[3,3]`; `n = 7` → `[4,3]`; `n = 11` → `[4,4,3]`. For any team of size < 4, `getTurnOrder` (rounds.ts:37) appends only *one* extra player → 4 turns, but `advanceTurn` (game.ts:292) loops until `MAX_TURNS=5`, so `turnOrder[4]` is `undefined`: a phantom guess with `playerId: undefined` is pushed and a turn nobody can answer wastes a full 16s timeout. Fix: enforce a per-team minimum of 4 in the assignment algorithm (merge/rebalance remainder teams), and make the round logic derive turn count from `turnOrder.length` rather than the hardcoded `MAX_TURNS`.

[server/game.ts:155] **Manual questions added after team assignment are silently ignored.** `initQuestions()` runs once inside `doAssignTeams` and freezes `gameQuestions.selected`. `addManualQuestion` (game.ts:168) only pushes to `manual` and never rebuilds `selected`, so any manual question added in the admin console after teams are assigned never appears in a round — despite the spec promising manual questions take priority. Fix: rebuild `selected` (preserving already-played rounds) whenever manual questions change before the round is reached, or recompute the upcoming slot lazily in `previewNextQuestion`/`doStartRound`.

[server/game.ts:161] **More than 10 manual questions corrupts selection.** `needed = TOTAL_ROUNDS - manualCount`; if `manualCount > 10`, `needed` is negative and `pool.slice(0, needed)` returns "all but the last |needed|" pool entries, so `selected` becomes `manual (>10) + many pool` instead of being capped. Fix: clamp `needed = Math.max(0, TOTAL_ROUNDS - manualCount)` and truncate `selected` to `TOTAL_ROUNDS`.

[server/game.ts:374] **Admin cannot switch the result view back to "chain" after showing the scoreboard.** `doShowResult('chain')` does nothing (relies on the one-time `roundResult` broadcast), while the host only renders the chain on a `roundResult` message. So chain→scoreboard works but scoreboard→chain (an explicit spec toggle, "연상 체인 ↔ 스코어보드 전환") does not. Fix: on `view==='chain'` re-broadcast a `roundResult` (or a dedicated view-switch message) so the host re-renders the chain.

## Nit
[src/player/main.ts:156] **Client timer compares server `timerStart` (server clock) against client `Date.now()`.** Clock skew between phone and server makes the displayed countdown drift; it's display-only (server enforces the real cutoff) but can show 0s while input is still accepted, or vice-versa. Fix: derive remaining time from a server-sent `now`/offset, or have the server send remaining ms.

[src/player/main.ts:193] **`timerInterval` is not cleared when the round result is shown**, so the countdown interval keeps firing against a stale `serverStart` after the round ends. Fix: `clearInterval(timerInterval)` in `showRoundResultDetails`.

[server/game.ts:180] **Previewing a question before team assignment reshuffles it away.** `previewNextQuestion` lazily calls `initQuestions`, but `doAssignTeams` later calls `initQuestions` again, re-shuffling the pool — so a question the host previewed and liked pre-assignment changes after assignment. Fix: only build the pool once (guard `initQuestions` if already initialized).

## Good points
- Answer judging is fully server-side and `targetWord` is never sent to clients until `roundResult` — matches the security requirement.
- WebSocket fan-out (`sendToTeam`) correctly isolates per-team `turnUpdate`/`turnTimeout`/`roundComplete`; the host receives no in-round detail, per spec.
- Turn rotation and the 4-person "first batter repeats" rule are implemented correctly and well tested (rounds.test.ts), and over 10 rounds `roundIndex % 5` gives each 5-player member the lead twice.
- Server timeout (`setTimeout` at `TURN_TIME_MS + GRACE_MS`) and the `submitGuess` cutoff check use the identical 16s bound, keeping the grace period consistent.
- Final-ranking tie-break (total score, then solved-round count, with shared ranks on full ties) matches the spec and is covered by a test.
- Empty-string and start-word submissions are handled exactly as specified (ignored / treated as wrong), and timeouts push an empty guess that the UI renders as "(패스)" without polluting the hint chain.
