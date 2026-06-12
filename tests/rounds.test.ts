import { describe, it, expect } from 'vitest';
import { createRoundState, getTurnOrder, checkAnswer, calculateScore, isRoundComplete, getRoundResults, MAX_TURNS } from '../server/rounds';
import type { Team, Question } from '../src/shared/types';

function makeTeam(id: number, size: number): Team {
  return { id, playerIds: Array.from({ length: size }, (_, i) => `t${id}p${i}`), scores: [] };
}

describe('getTurnOrder', () => {
  it('returns 5 elements for a 5-player team', () => {
    const team = makeTeam(1, 5);
    const order = getTurnOrder(team, 0);
    expect(order.length).toBe(5);
    expect(order).toEqual(['t1p0', 't1p1', 't1p2', 't1p3', 't1p4']);
  });

  it('rotates by roundIndex', () => {
    const team = makeTeam(1, 5);
    const order = getTurnOrder(team, 2);
    expect(order).toEqual(['t1p2', 't1p3', 't1p4', 't1p0', 't1p1']);
  });

  it('wraps around for large roundIndex', () => {
    const team = makeTeam(1, 5);
    const order = getTurnOrder(team, 7); // 7 % 5 = 2
    expect(order).toEqual(['t1p2', 't1p3', 't1p4', 't1p0', 't1p1']);
  });

  it('4-player team gets 5 turns (first player repeats)', () => {
    const team = makeTeam(1, 4);
    const order = getTurnOrder(team, 0);
    expect(order.length).toBe(5);
    expect(order).toEqual(['t1p0', 't1p1', 't1p2', 't1p3', 't1p0']);
  });

  it('4-player team rotates correctly', () => {
    const team = makeTeam(1, 4);
    const order = getTurnOrder(team, 1);
    expect(order).toEqual(['t1p1', 't1p2', 't1p3', 't1p0', 't1p1']);
  });
});

describe('checkAnswer', () => {
  it('matches exact (case-insensitive, trimmed)', () => {
    expect(checkAnswer('소금', '소금')).toBe(true);
    expect(checkAnswer('  소금  ', '소금')).toBe(true);
    expect(checkAnswer('ABC', 'abc')).toBe(true);
  });

  it('rejects wrong answer', () => {
    expect(checkAnswer('설탕', '소금')).toBe(false);
    expect(checkAnswer('', '소금')).toBe(false);
  });
});

describe('calculateScore', () => {
  it('gives correct points per turn', () => {
    expect(calculateScore(0)).toBe(5);
    expect(calculateScore(1)).toBe(4);
    expect(calculateScore(2)).toBe(3);
    expect(calculateScore(3)).toBe(2);
    expect(calculateScore(4)).toBe(1);
  });
});

describe('createRoundState & isRoundComplete', () => {
  const q: Question = { startWord: '바다', targetWord: '소금' };
  const teams = [makeTeam(1, 5), makeTeam(2, 5)];

  it('creates progress for each team', () => {
    const state = createRoundState(0, q, teams);
    expect(state.teamProgress.size).toBe(2);
    expect(state.teamProgress.get(1)!.completed).toBe(false);
  });

  it('isRoundComplete returns false when not all done', () => {
    const state = createRoundState(0, q, teams);
    expect(isRoundComplete(state)).toBe(false);
  });

  it('isRoundComplete returns true when all done', () => {
    const state = createRoundState(0, q, teams);
    state.teamProgress.get(1)!.completed = true;
    state.teamProgress.get(2)!.completed = true;
    expect(isRoundComplete(state)).toBe(true);
  });
});

describe('getRoundResults', () => {
  it('returns results sorted by teamId', () => {
    const q: Question = { startWord: '바다', targetWord: '소금' };
    const teams = [makeTeam(2, 5), makeTeam(1, 5)];
    const state = createRoundState(0, q, teams);
    state.teamProgress.get(1)!.score = 5;
    state.teamProgress.get(2)!.score = 3;
    const results = getRoundResults(state);
    expect(results[0].teamId).toBe(1);
    expect(results[1].teamId).toBe(2);
  });
});
