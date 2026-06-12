import { describe, it, expect } from 'vitest';
import { assignTeams } from '../server/teams';
import type { Player } from '../src/shared/types';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: `Player${i}`,
    teamId: null,
    orderInTeam: null,
  }));
}

describe('assignTeams', () => {
  it('throws if less than 4 players', () => {
    expect(() => assignTeams(makePlayers(3))).toThrow('최소 4명 필요');
  });

  it('assigns 5 players to 1 team of 5', () => {
    const players = makePlayers(5);
    const teams = assignTeams(players);
    expect(teams.length).toBe(1);
    expect(teams[0].playerIds.length).toBe(5);
  });

  it('assigns 10 players to 2 teams of 5', () => {
    const players = makePlayers(10);
    const teams = assignTeams(players);
    expect(teams.length).toBe(2);
    expect(teams[0].playerIds.length).toBe(5);
    expect(teams[1].playerIds.length).toBe(5);
  });

  it('assigns 23 players to 5 teams (3×5 + 2×4)', () => {
    const players = makePlayers(23);
    const teams = assignTeams(players);
    expect(teams.length).toBe(5);
    const sizes = teams.map(t => t.playerIds.length).sort();
    expect(sizes).toEqual([4, 4, 5, 5, 5]);
  });

  it('assigns 100 players to 20 teams of 5', () => {
    const players = makePlayers(100);
    const teams = assignTeams(players);
    expect(teams.length).toBe(20);
    teams.forEach(t => expect(t.playerIds.length).toBe(5));
  });

  it('assigns 97 players: 17×5 + 3×4', () => {
    const players = makePlayers(97);
    const teams = assignTeams(players);
    expect(teams.length).toBe(20);
    const fives = teams.filter(t => t.playerIds.length === 5).length;
    const fours = teams.filter(t => t.playerIds.length === 4).length;
    expect(fives).toBe(17);
    expect(fours).toBe(3);
  });

  it('sets teamId and orderInTeam on players', () => {
    const players = makePlayers(8);
    const teams = assignTeams(players);
    for (const team of teams) {
      team.playerIds.forEach((pid, idx) => {
        const p = players.find(pp => pp.id === pid)!;
        expect(p.teamId).toBe(team.id);
        expect(p.orderInTeam).toBe(idx);
      });
    }
  });

  it('assigns 4 players to 1 team of 4', () => {
    const players = makePlayers(4);
    const teams = assignTeams(players);
    expect(teams.length).toBe(1);
    expect(teams[0].playerIds.length).toBe(4);
  });
});
