import { Team, Question, RoundState, TeamRoundProgress, RoundGuess, RoundResultEntry } from '../src/shared/types.js';

const TURN_TIME_MS = 15_000;
const GRACE_MS = 1_000;
const MAX_TURNS = 5;
const TOTAL_ROUNDS = 10;

export { TURN_TIME_MS, GRACE_MS, MAX_TURNS, TOTAL_ROUNDS };

export function createRoundState(roundIndex: number, question: Question, teams: Team[]): RoundState {
  const teamProgress = new Map<number, TeamRoundProgress>();
  for (const team of teams) {
    teamProgress.set(team.id, {
      currentTurnIndex: 0,
      guesses: [],
      completed: false,
      score: 0,
      timerStart: null,
    });
  }
  return { roundIndex, question, teamProgress };
}

/**
 * 라운드에서 팀의 턴 순서를 계산.
 * 4명 팀: 5턴을 만들기 위해 첫 번째 타자가 마지막에 한 번 더.
 * 로테이션: 라운드마다 시작 타자가 1칸씩 밀림.
 */
export function getTurnOrder(team: Team, roundIndex: number): string[] {
  const size = team.playerIds.length;
  const offset = roundIndex % size;
  const rotated: string[] = [];
  for (let i = 0; i < size; i++) {
    rotated.push(team.playerIds[(offset + i) % size]);
  }
  // 팀 인원이 MAX_TURNS(5)보다 적으면 앞에서부터 반복하여 패딩
  while (rotated.length < MAX_TURNS) {
    rotated.push(rotated[rotated.length - size]);
  }
  return rotated;
}

export function checkAnswer(guess: string, targetWord: string): boolean {
  return guess.trim().toLowerCase() === targetWord.trim().toLowerCase();
}

export function calculateScore(turnIndex: number): number {
  return MAX_TURNS - turnIndex; // turn 0 → 5점, turn 4 → 1점
}

export function isRoundComplete(state: RoundState): boolean {
  for (const progress of state.teamProgress.values()) {
    if (!progress.completed) return false;
  }
  return true;
}

export function getRoundResults(state: RoundState): RoundResultEntry[] {
  const results: RoundResultEntry[] = [];
  for (const [teamId, progress] of state.teamProgress.entries()) {
    results.push({
      teamId,
      guesses: progress.guesses,
      score: progress.score,
      targetWord: state.question.targetWord,
    });
  }
  return results.sort((a, b) => a.teamId - b.teamId);
}
