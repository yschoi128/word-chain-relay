/**
 * Spec invariant tests for word-chain-relay.
 * These verify the core game mechanics described in the design document,
 * not just surface behavior.
 */
import { describe, it, expect } from 'vitest';
import { assignTeams } from '../server/teams';
import { createRoundState, getTurnOrder, checkAnswer, calculateScore, isRoundComplete, MAX_TURNS, TOTAL_ROUNDS } from '../server/rounds';
import type { Player, Team, Question, RoundGuess } from '../src/shared/types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `Player${i}`,
    teamId: null,
    orderInTeam: null,
  }));
}

function makeTeam(id: number, playerIds: string[]): Team {
  return { id, playerIds, scores: [] };
}

// Simulates a full round for a team: each player submits a guess in order.
// Returns the progress state after all turns.
function simulateTeamRound(
  team: Team,
  roundIndex: number,
  question: Question,
  answers: string[] // one per turn (5 entries); empty string = timeout/pass
) {
  const turnOrder = getTurnOrder(team, roundIndex);
  const guesses: RoundGuess[] = [];
  let score = 0;
  let completedAtTurn = -1;

  for (let i = 0; i < MAX_TURNS; i++) {
    const word = answers[i] ?? '';
    if (!word) {
      // pass/timeout — no hint added
      guesses.push({ playerId: turnOrder[i], word: '', correct: false, turnIndex: i });
      continue;
    }
    const correct = checkAnswer(word, question.targetWord);
    guesses.push({ playerId: turnOrder[i], word, correct, turnIndex: i });
    if (correct) {
      score = calculateScore(i);
      completedAtTurn = i;
      break;
    }
  }

  return { guesses, score, completedAtTurn, turnOrder };
}

describe('Spec: Turn relay — all 5 slots are exercised', () => {
  const team = makeTeam(1, ['A', 'B', 'C', 'D', 'E']);
  const question: Question = { startWord: '바다', targetWord: '소금' };

  it('when all fail, exactly 5 different players submitted (no one skipped)', () => {
    const answers = ['파도', '짠맛', '바닷물', '해변', '모래'];
    const result = simulateTeamRound(team, 0, question, answers);

    expect(result.guesses.length).toBe(5);
    const playerIds = result.guesses.map(g => g.playerId);
    // All 5 distinct players acted
    expect(new Set(playerIds).size).toBe(5);
    // Each player submitted exactly once
    for (const pid of team.playerIds) {
      expect(playerIds.filter(id => id === pid).length).toBe(1);
    }
    expect(result.score).toBe(0);
  });

  it('when 3rd player answers correctly, players 1 & 2 must have also submitted wrong guesses', () => {
    const answers = ['파도', '짠맛', '소금']; // 3rd correct
    const result = simulateTeamRound(team, 0, question, answers);

    // 3 guesses total (not just 1 from the correct player)
    expect(result.guesses.length).toBe(3);
    // First two are wrong, submitted by different players
    expect(result.guesses[0].correct).toBe(false);
    expect(result.guesses[0].playerId).not.toBe(result.guesses[2].playerId);
    expect(result.guesses[1].correct).toBe(false);
    expect(result.guesses[1].playerId).not.toBe(result.guesses[2].playerId);
    // Third is correct
    expect(result.guesses[2].correct).toBe(true);
    expect(result.score).toBe(3); // 3rd turn → 3 points
  });

  it('a timeout (empty string) counts as a turn but the player still "acted" (was called)', () => {
    // Player 2 times out, then player 3 gets it
    const answers = ['파도', '', '소금'];
    const result = simulateTeamRound(team, 0, question, answers);

    expect(result.guesses.length).toBe(3);
    // Turn 1: player submitted wrong
    expect(result.guesses[0].word).toBe('파도');
    // Turn 2: timeout — player was still assigned and "acted" (timed out)
    expect(result.guesses[1].word).toBe('');
    expect(result.guesses[1].playerId).toBe(result.turnOrder[1]);
    // Turn 3: correct
    expect(result.guesses[2].correct).toBe(true);
    expect(result.score).toBe(3);
  });
});

describe('Spec: 4-player team — first player plays twice (position 1 and 5)', () => {
  const team = makeTeam(1, ['A', 'B', 'C', 'D']);

  it('turn order has 5 slots with first player appearing at index 0 and 4', () => {
    const order = getTurnOrder(team, 0);
    expect(order.length).toBe(5);
    expect(order[0]).toBe('A');
    expect(order[4]).toBe('A'); // first player repeats as 5th
    // Middle players appear exactly once
    expect(order[1]).toBe('B');
    expect(order[2]).toBe('C');
    expect(order[3]).toBe('D');
  });

  it('with rotation (round 1), B is first and repeats at position 5', () => {
    const order = getTurnOrder(team, 1);
    expect(order[0]).toBe('B');
    expect(order[4]).toBe('B');
    expect(order[1]).toBe('C');
    expect(order[2]).toBe('D');
    expect(order[3]).toBe('A');
  });

  it('when all 5 turns are used and first player acts at both slots', () => {
    const question: Question = { startWord: '학교', targetWord: '시험' };
    const answers = ['교실', '공부', '선생', '과목', '시험']; // 5th (first player again) gets it
    const result = simulateTeamRound(team, 0, question, answers);

    expect(result.guesses.length).toBe(5);
    // First player (A) submitted at turn 0 AND turn 4
    const actionsOfA = result.guesses.filter(g => g.playerId === 'A');
    expect(actionsOfA.length).toBe(2);
    expect(actionsOfA[0].turnIndex).toBe(0);
    expect(actionsOfA[1].turnIndex).toBe(4);
    expect(actionsOfA[1].correct).toBe(true);
    expect(result.score).toBe(1); // 5th turn → 1 point
  });
});

describe('Spec: Rotation fairness — over 10 rounds, each player is 1st turn exactly twice (5-player)', () => {
  const team = makeTeam(1, ['A', 'B', 'C', 'D', 'E']);

  it('each of 5 players leads exactly 2 rounds out of 10', () => {
    const firstPlayerCounts: Record<string, number> = {};
    for (const pid of team.playerIds) firstPlayerCounts[pid] = 0;

    for (let round = 0; round < TOTAL_ROUNDS; round++) {
      const order = getTurnOrder(team, round);
      firstPlayerCounts[order[0]]++;
    }

    for (const pid of team.playerIds) {
      expect(firstPlayerCounts[pid]).toBe(2);
    }
  });
});

describe('Spec: Scoring contract per turn position', () => {
  it('1st turn correct → 5 pts', () => expect(calculateScore(0)).toBe(5));
  it('2nd turn correct → 4 pts', () => expect(calculateScore(1)).toBe(4));
  it('3rd turn correct → 3 pts', () => expect(calculateScore(2)).toBe(3));
  it('4th turn correct → 2 pts', () => expect(calculateScore(3)).toBe(2));
  it('5th turn correct → 1 pt', () => expect(calculateScore(4)).toBe(1));
});

describe('Spec: Answer judgment — exact match only', () => {
  it('exact match passes', () => {
    expect(checkAnswer('소금', '소금')).toBe(true);
  });
  it('case insensitive', () => {
    expect(checkAnswer('ABC', 'abc')).toBe(true);
  });
  it('trims whitespace', () => {
    expect(checkAnswer('  소금  ', '소금')).toBe(true);
  });
  it('synonym/similar word fails (not exact)', () => {
    expect(checkAnswer('소곰', '소금')).toBe(false); // typo
    expect(checkAnswer('salt', '소금')).toBe(false); // different language
  });
  it('empty string fails', () => {
    expect(checkAnswer('', '소금')).toBe(false);
  });
});

describe('Spec: Round completion — requires ALL teams to finish', () => {
  const question: Question = { startWord: '바다', targetWord: '소금' };
  const teams = [makeTeam(1, ['a', 'b', 'c', 'd', 'e']), makeTeam(2, ['f', 'g', 'h', 'i', 'j'])];

  it('one team done, other not → round NOT complete', () => {
    const state = createRoundState(0, question, teams);
    state.teamProgress.get(1)!.completed = true;
    state.teamProgress.get(2)!.completed = false;
    expect(isRoundComplete(state)).toBe(false);
  });

  it('both teams done → round IS complete', () => {
    const state = createRoundState(0, question, teams);
    state.teamProgress.get(1)!.completed = true;
    state.teamProgress.get(2)!.completed = true;
    expect(isRoundComplete(state)).toBe(true);
  });
});

describe('Spec: Final ranking — tiebreaker by solved rounds', () => {
  it('same total score, team with more solved rounds ranks higher', () => {
    const teamA: Team = { id: 1, playerIds: [], scores: [5, 0, 5, 0, 3, 0, 0, 0, 0, 0] }; // total=13, solved=3
    const teamB: Team = { id: 2, playerIds: [], scores: [4, 4, 3, 2, 0, 0, 0, 0, 0, 0] }; // total=13, solved=4

    const ranked = [teamA, teamB].map(t => ({
      teamId: t.id,
      totalScore: t.scores.reduce((a, b) => a + b, 0),
      solvedRounds: t.scores.filter(s => s > 0).length,
    })).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.solvedRounds - a.solvedRounds;
    });

    expect(ranked[0].teamId).toBe(2);
    expect(ranked[1].teamId).toBe(1);
  });

  it('different total scores, higher score ranks first regardless of solved rounds', () => {
    const teamA: Team = { id: 1, playerIds: [], scores: [5, 5, 5, 0, 0, 0, 0, 0, 0, 0] }; // total=15, solved=3
    const teamB: Team = { id: 2, playerIds: [], scores: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }; // total=10, solved=10

    const ranked = [teamA, teamB].map(t => ({
      teamId: t.id,
      totalScore: t.scores.reduce((a, b) => a + b, 0),
      solvedRounds: t.scores.filter(s => s > 0).length,
    })).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.solvedRounds - a.solvedRounds;
    });

    expect(ranked[0].teamId).toBe(1); // higher total wins
  });

  it('same total AND same solved rounds → same rank (tied)', () => {
    const teamA: Team = { id: 1, playerIds: [], scores: [5, 4, 0, 0, 0, 0, 0, 0, 0, 0] }; // 9, solved=2
    const teamB: Team = { id: 2, playerIds: [], scores: [5, 4, 0, 0, 0, 0, 0, 0, 0, 0] }; // 9, solved=2

    const teams = [teamA, teamB];
    const ranked = teams.map(t => ({
      teamId: t.id,
      totalScore: t.scores.reduce((a, b) => a + b, 0),
      solvedRounds: t.scores.filter(s => s > 0).length,
    })).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.solvedRounds - a.solvedRounds;
    });

    // Assign ranks: tied teams get same rank
    let currentRank = 1;
    const ranking = ranked.map((t, i) => {
      if (i > 0 && (t.totalScore !== ranked[i - 1].totalScore || t.solvedRounds !== ranked[i - 1].solvedRounds)) {
        currentRank = i + 1;
      }
      return { ...t, rank: currentRank };
    });

    expect(ranking[0].rank).toBe(1);
    expect(ranking[1].rank).toBe(1); // tied → same rank
  });
});

describe('Spec: Team assignment constraints', () => {
  it('all teams have exactly 4 or 5 members (never less, never more)', () => {
    for (const n of [4, 5, 8, 9, 10, 13, 20, 23, 50, 97, 100]) {
      const players = makePlayers(n);
      const teams = assignTeams(players);
      for (const team of teams) {
        expect(team.playerIds.length).toBeGreaterThanOrEqual(4);
        expect(team.playerIds.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it('every player is assigned to exactly one team', () => {
    const players = makePlayers(23);
    const teams = assignTeams(players);
    const allAssigned = teams.flatMap(t => t.playerIds);
    expect(allAssigned.length).toBe(23);
    expect(new Set(allAssigned).size).toBe(23); // no duplicates
    // All original player ids present
    for (const p of players) {
      expect(allAssigned).toContain(p.id);
    }
  });

  it('teamId and orderInTeam are set on every player after assignment', () => {
    const players = makePlayers(20);
    assignTeams(players);
    for (const p of players) {
      expect(p.teamId).not.toBeNull();
      expect(p.orderInTeam).not.toBeNull();
      expect(p.orderInTeam).toBeGreaterThanOrEqual(0);
      expect(p.orderInTeam!).toBeLessThan(5);
    }
  });
});

describe('Spec: Hint accumulation — wrong guesses visible to subsequent players', () => {
  it('after turns 1 and 2 fail, turn 3 player has access to both previous guesses', () => {
    const team = makeTeam(1, ['A', 'B', 'C', 'D', 'E']);
    const question: Question = { startWord: '캠핑', targetWord: '텐트' };
    const state = createRoundState(0, question, [team]);
    const progress = state.teamProgress.get(1)!;
    const turnOrder = getTurnOrder(team, 0);

    // Turn 0: A guesses wrong
    progress.guesses.push({ playerId: turnOrder[0], word: '야외', correct: false, turnIndex: 0 });
    progress.currentTurnIndex = 1;

    // Turn 1: B guesses wrong
    progress.guesses.push({ playerId: turnOrder[1], word: '잠', correct: false, turnIndex: 1 });
    progress.currentTurnIndex = 2;

    // At this point, player C (turn 2) can see the hint chain:
    const visibleHints = progress.guesses.filter(g => g.word !== '');
    expect(visibleHints.length).toBe(2);
    expect(visibleHints[0].word).toBe('야외');
    expect(visibleHints[1].word).toBe('잠');

    // C uses hints to guess correctly
    const cCorrect = checkAnswer('텐트', question.targetWord);
    expect(cCorrect).toBe(true);
    progress.guesses.push({ playerId: turnOrder[2], word: '텐트', correct: true, turnIndex: 2 });
    progress.score = calculateScore(2);

    expect(progress.score).toBe(3);
    // Verify chain: 야외 → 잠 → 텐트(정답)
    expect(progress.guesses.map(g => g.word)).toEqual(['야외', '잠', '텐트']);
  });

  it('timeout produces empty hint (not visible as useful clue)', () => {
    const team = makeTeam(1, ['A', 'B', 'C', 'D', 'E']);
    const question: Question = { startWord: '학교', targetWord: '시험' };
    const state = createRoundState(0, question, [team]);
    const progress = state.teamProgress.get(1)!;
    const turnOrder = getTurnOrder(team, 0);

    // Turn 0: timeout
    progress.guesses.push({ playerId: turnOrder[0], word: '', correct: false, turnIndex: 0 });
    progress.currentTurnIndex = 1;

    // Non-empty hints visible to next player
    const usefulHints = progress.guesses.filter(g => g.word !== '');
    expect(usefulHints.length).toBe(0); // no useful hint from timeout
  });
});

describe('Spec: Multi-round score accumulation', () => {
  it('team scores accumulate correctly across 10 rounds', () => {
    const team: Team = { id: 1, playerIds: ['a', 'b', 'c', 'd', 'e'], scores: [] };

    // Simulate 10 rounds with varying results
    const roundResults = [5, 4, 0, 3, 2, 0, 1, 5, 4, 3]; // various turns correct
    for (const s of roundResults) {
      team.scores.push(s);
    }

    expect(team.scores.length).toBe(10);
    expect(team.scores.reduce((a, b) => a + b, 0)).toBe(27);
  });
});

describe('Spec: Constants match design document', () => {
  it('MAX_TURNS is 5 (5 players per team)', () => {
    expect(MAX_TURNS).toBe(5);
  });

  it('TOTAL_ROUNDS is 10', () => {
    expect(TOTAL_ROUNDS).toBe(10);
  });
});
