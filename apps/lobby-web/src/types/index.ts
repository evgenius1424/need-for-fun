export interface RoomListItem { roomName: string; roomCode: string; playersCount: number; maxPlayers: number; status: 'waiting'|'in_game' }
export interface Player { playerId: string; displayName: string; role: 'host'|'player'; connected: boolean }
export interface RoomSnapshot { roomCode: string; roomName: string; status: 'waiting'|'in_game'; players: Player[]; maxPlayers: number }
