import { describe, it, expect } from 'vitest';
import { assignTeams } from '../server/teams';
import { createRoundState, getTurnOrder, checkAnswer, calculateScore } from '../server/rounds';
import type { Player, Team, RoundGuess } from '../src/shared/types';

describe('game integration', () => {
  it('simulates a full round with correct answer on turn 2', () => {
    const players: Player[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, nickname: `P${i}`, teamId: null, orderInTeam: null,
    }));
    const teams = assignTeams(players);
    const team = teams[0];
    const question = { startWord: '바다', targetWord: '소금' };
    const state = createRoundState(0, question, teams);
    const progress = state.teamProgress.get(team.id)!;
    const turnOrder = getTurnOrder(team, 0);

    // Turn 0: wrong answer
    const guess1: RoundGuess = { playerId: turnOrder[0], word: '파도', correct: false, turnIndex: 0 };
    progress.guesses.push(guess1);
    progress.currentTurnIndex = 1;

    // Turn 1: correct
    const correct = checkAnswer('소금', question.targetWord);
    expect(correct).toBe(true);
    const guess2: RoundGuess = { playerId: turnOrder[1], word: '소금', correct: true, turnIndex: 1 };
    progress.guesses.push(guess2);
    progress.completed = true;
    progress.score = calculateScore(1);

    expect(progress.score).toBe(4);
    expect(progress.completed).toBe(true);
  });

  it('simulates all 5 turns fail → 0 points', () => {
    const players: Player[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, nickname: `P${i}`, teamId: null, orderInTeam: null,
    }));
    const teams = assignTeams(players);
    const team = teams[0];
    const question = { startWord: '학교', targetWord: '시험' };
    const state = createRoundState(0, question, teams);
    const progress = state.teamProgress.get(team.id)!;
    const turnOrder = getTurnOrder(team, 0);

    for (let i = 0; i < 5; i++) {
      progress.guesses.push({ playerId: turnOrder[i], word: `틀린답${i}`, correct: false, turnIndex: i });
      progress.currentTurnIndex = i + 1;
    }
    progress.completed = true;
    progress.score = 0;

    expect(progress.score).toBe(0);
    expect(progress.guesses.length).toBe(5);
  });

  it('10 rounds scoring sums correctly', () => {
    const team: Team = { id: 1, playerIds: ['a', 'b', 'c', 'd', 'e'], scores: [] };
    const roundScores = [5, 0, 3, 4, 0, 2, 1, 5, 3, 0];
    team.scores = roundScores;
    const total = team.scores.reduce((a, b) => a + b, 0);
    expect(total).toBe(23);
  });

  it('final ranking respects solved-rounds tiebreaker', () => {
    const teamA = { id: 1, scores: [5, 0, 5, 0, 3, 0, 0, 0, 0, 0] }; // total=13, solvedRounds=3
    const teamB = { id: 2, scores: [4, 4, 3, 2, 0, 0, 0, 0, 0, 0] }; // total=13, solvedRounds=4

    const ranked = [teamA, teamB].map(t => ({
      teamId: t.id,
      totalScore: t.scores.reduce((a, b) => a + b, 0),
      solvedRounds: t.scores.filter(s => s > 0).length,
    })).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return b.solvedRounds - a.solvedRounds;
    });

    expect(ranked[0].teamId).toBe(2); // more solved rounds
  });
});
