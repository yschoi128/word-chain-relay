Manual computation confirms: N=6→[3,3], N=7→[4,3], N=11→[4,4,3] all produce sub-4 teams. I have enough to finalize.

# Review Result (Claude Reviewer)
VERDICT: FIX_REQUIRED

## Critical (must fix)
[server/rounds.ts:37-39] **`getTurnOrder` under-pads turn order for teams smaller than 4, producing phantom unplayable turns.** The padding only ever appends ONE extra player (`if (size < MAX_TURNS) rotated.push(rotated[0])`), which assumes the team is exactly 4. `MAX_TURNS` is 5, so a 3-player team yields a turn order of length 4 (indices 0–3). When `advanceTurn` reaches `currentTurnIndex === 4` (game.ts:329-338), `turnOrder[4]` is `undefined`: `handleTimeout` (game.ts:308) builds a guess with `playerId: undefined`, and `submitGuess` (game.ts:470-471) computes `currentPlayerId === undefined`, so no real player can ever match — every 3-player team is forced into a guaranteed 16-second auto-timeout 5th turn that no one can answer, corrupting the round lifecycle. This is reachable in practice because `assignTeams` produces 3-player teams (see below). Fix: pad `rotated` by repeating from the front until it reaches `MAX_TURNS` (e.g. `while (rotated.length < MAX_TURNS) rotated.push(rotated[rotated.length - size]);` or `rotated.push(rotated[(rotated.length) % size])`).

[server/teams.ts:16-18] **Team assignment can create teams of 3, violating the spec's "최소 4명/팀 유지" invariant and triggering the turn-order defect above.** `baseSize = floor(N / ceil(N/5))` drops below 4 for N=6 → [3,3], N=7 → [4,3], and N=11 → [4,4,3] (the spec's own worked algorithm reproduces [4,4,3] for 11). The code only guards `n < 4` and never enforces a minimum team size, so any such headcount (very plausible in a rehearsal/small test) yields a broken 3-person team. Fix: detect when `baseSize < 4` and either merge the short team into others (cap teams at 5) or surface a "이 인원수로는 4–5명 팀 구성 불가" error; at minimum guarantee no team has fewer than 4 members whenever feasible, and make `getTurnOrder` robust regardless.

## Warning
[server/game.ts:413-425] **Switching the host result view back to "chain" does nothing.** `doShowResult('chain')` only comments "roundResult already sent" and emits no message; the chain `roundResult` payload is broadcast exactly once at round end (game.ts:383). After the admin presses "스코어보드" (which re-broadcasts the scoreboard) there is no way to return the host screen to the association chain, contradicting the spec's "연상 체인 ↔ 스코어보드 전환" toggle. Fix: cache the last `RoundResultEntry[]` and re-`broadcastAll({ type: 'roundResult', results })` when `view === 'chain'`.

[src/player/main.ts:200-204] **Player "누적 N점" is wrong for rounds 2+.** The cumulative total is `team.scores.reduce(...) + myResult.score`, but the client's `teams` is the snapshot from `teamAssigned` (scores `[]`), and the player handler ignores `scoreboard` messages (main.ts:67-68), so `team.scores` is never updated during continuous play. Every round the player sees only the current round's points labeled as cumulative. Fix: track cumulative score from the `scoreboard` message (it carries `totalScore` per team) or accumulate `myResult.score` across rounds client-side.

[server/game.ts:393-396] **Round 10 result is immediately overwritten by the final result, removing host control of the last round's display.** When `currentRoundIndex` reaches `TOTAL_ROUNDS`, `finishRound` broadcasts `roundResult`+`scoreboard` and then synchronously calls `showFinalResult`, which broadcasts `phaseChange: 'finalResult'` and `finalResult`. Host/player screens flash the round-10 chain and jump straight to the final standings, and the admin can no longer toggle the round-10 chain/scoreboard (phase is now `finalResult`). Fix: stay in `roundResult` after round 10 and require an explicit admin action (e.g. "다음 라운드"/"최종 결과") to enter `finalResult`.

[server/game.ts:194-205] **Manual questions added after "팀 배정" are silently ignored.** `initQuestions` runs once inside `doAssignTeams` and freezes `selected`. Any `addManualQuestion` call afterward only mutates `gameQuestions.manual`, which is never re-folded into `selected`, so the admin's late manual entries never appear in a round despite the spec promising manual questions are used with priority. Fix: rebuild `selected` when manual questions change before the round consumes them, or restrict manual edits to the lobby phase and document it.

[server/game.ts:77-101] **Reconnect during `roundResult`/`finalResult` shows an empty screen.** The reconnect re-send only fires for `phase === 'roundActive'`; a player who reconnects during `roundResult` (player/main.ts:245-249 shows `section-result`) or `finalResult` gets no `roundResult`/`finalResult` payload pushed, so the section renders blank. Fix: on player WS register (or in `/api/status`), also re-send the last round result / final ranking for the current phase.

## Nit
[src/player/main.ts:144] **Turn indicator omits the player's name.** Spec 1-3 specifies "OOO님 차례입니다", but the UI shows "N번째 타자 차례입니다". Fix: resolve `currentTurnOrder[turnIndex]` through `nicknameMap`.

[src/host/main.ts:126-128] **Scoreboard rank uses array index, ignoring ties.** `showScoreboard` prints `i + 1` as the rank, so tied teams get distinct positions; only the final-result view (game.ts:439-445) computes shared ranks. Fix: apply the same tie-aware ranking on the scoreboard.

[server/game.ts:433] **Tiebreaker semantics are an interpretation of an ambiguous spec.** "먼저 맞춘 라운드 수가 많은 팀" is implemented as `scores.filter(s > 0).length` (count of solved rounds). If the intent was "solved earliest/fastest", this differs. Worth confirming with the spec owner.

[server/game.ts:207-209] **`addManualQuestion` has no cap.** If ≥10 manual questions are added, `needed` goes ≤0, `pool.slice(0, needed)` returns `[]`, and `selected` may exceed 10 with the excess silently dropped. Fix: reject or warn when manual count ≥ `TOTAL_ROUNDS`.

## Good points
- Answer judging is fully server-authoritative (`checkAnswer`, game.ts:478) and the target word is never sent to clients until the round result — matches the anti-cheat requirement.
- Per-team WebSocket isolation is consistently enforced: `turnUpdate`/`roundComplete` go only to the team (game.ts:281, 346), and `/api/status` filters other teams' progress during `roundActive` (game.ts:129-140), preventing hint leakage.
- Turn handling is effectively atomic on Node's single thread, and a valid submit clears and deletes the team timer before advancing (game.ts:488-490), cleanly preventing the duplicate-pass race.
- The 1-second grace period is applied both at the server timer (`TURN_TIME_MS + GRACE_MS`, game.ts:295) and at the submit-time cutoff check (game.ts:474), keeping client/server timing consistent.
- Reconnection during an active round correctly re-sends `roundStart` + `turnUpdate` with the original `timerStart` (game.ts:83-98), so a returning player resumes with the correct remaining time and turn highlight.
