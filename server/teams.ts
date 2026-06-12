import { Player, Team } from '../src/shared/types.js';

/** Fisher-Yates shuffle (in-place) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function assignTeams(players: Player[]): Team[] {
  const n = players.length;
  if (n < 4) throw new Error('최소 4명 필요');

  // 최소 4명/팀, 최대 5명/팀을 보장하는 팀 수 계산
  const minTeams = Math.ceil(n / 5);
  const maxTeams = Math.floor(n / 4);
  if (minTeams > maxTeams) {
    throw new Error('이 인원수로는 4~5명 팀 구성이 불가합니다');
  }
  const teamCount = minTeams; // 가능한 가장 적은 팀 수 (5명 팀 최대화)
  const baseSize = Math.floor(n / teamCount);
  const extra = n - baseSize * teamCount;

  const shuffled = shuffle([...players]);
  const teams: Team[] = [];
  let idx = 0;

  for (let t = 0; t < teamCount; t++) {
    const size = t < extra ? baseSize + 1 : baseSize;
    const teamPlayers = shuffled.slice(idx, idx + size);
    idx += size;

    const team: Team = {
      id: t + 1,
      playerIds: teamPlayers.map(p => p.id),
      scores: [],
    };
    teams.push(team);

    teamPlayers.forEach((p, order) => {
      p.teamId = team.id;
      p.orderInTeam = order;
    });
  }

  return teams;
}
