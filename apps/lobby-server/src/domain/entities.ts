export type RoomStatus = 'waiting' | 'in_game';
export type PlayerRole = 'host' | 'player';

export interface Player {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  connected: boolean;
}

export interface Room {
  roomId: string;
  roomCode: string;
  roomName: string;
  status: RoomStatus;
  maxPlayers: number;
  players: Player[];
  createdAt: Date;
}

export interface PlayerSession {
  sessionId: string;
  playerId: string;
  roomCode: string;
  expiresAt: Date;
}
