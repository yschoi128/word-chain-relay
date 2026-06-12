export interface Player {
  id: string;
  nickname: string;
  teamId: number | null;
  orderInTeam: number | null;
}

export interface Team {
  id: number;
  playerIds: string[];
  scores: number[];
}

export interface Question {
  startWord: string;
  targetWord: string;
}

export interface RoundGuess {
  playerId: string;
  word: string;
  correct: boolean;
  turnIndex: number;
}

export interface TeamRoundProgress {
  currentTurnIndex: number;
  guesses: RoundGuess[];
  completed: boolean;
  score: number;
  timerStart: number | null;
}

export interface RoundState {
  roundIndex: number;
  question: Question;
  teamProgress: Map<number, TeamRoundProgress>;
}

export type GamePhase =
  | 'lobby'
  | 'teamAssigned'
  | 'roundActive'
  | 'roundResult'
  | 'finalResult';

export interface RoundResultEntry {
  teamId: number;
  guesses: RoundGuess[];
  score: number;
  targetWord: string;
}

export type WSMessage =
  | { type: 'playerCount'; count: number; nicknames: string[] }
  | { type: 'teamAssigned'; teams: Team[]; myTeamId: number; myOrder: number; nicknameMap: Record<string, string> }
  | { type: 'roundStart'; roundIndex: number; startWord: string; turnOrder: string[] }
  | { type: 'turnUpdate'; teamId: number; currentTurnIndex: number; guesses: RoundGuess[]; timerStart: number }
  | { type: 'turnTimeout'; teamId: number; turnIndex: number }
  | { type: 'roundComplete'; teamId: number; score: number; guesses: RoundGuess[] }
  | { type: 'roundResult'; results: RoundResultEntry[] }
  | { type: 'scoreboard'; teams: { teamId: number; totalScore: number; roundScore: number }[] }
  | { type: 'finalResult'; ranking: { teamId: number; totalScore: number; rank: number }[] }
  | { type: 'phaseChange'; phase: GamePhase };
