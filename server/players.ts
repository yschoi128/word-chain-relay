import { Player } from '../src/shared/types.js';

const players = new Map<string, Player>();

export function addPlayer(id: string, nickname: string): Player {
  const player: Player = { id, nickname, teamId: null, orderInTeam: null };
  players.set(id, player);
  return player;
}

export function getPlayer(id: string): Player | undefined {
  return players.get(id);
}

export function getAllPlayers(): Player[] {
  return [...players.values()];
}

export function getPlayerCount(): number {
  return players.size;
}

export function resetPlayers(): void {
  players.clear();
}
