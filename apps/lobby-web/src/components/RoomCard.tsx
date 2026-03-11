import type { RoomListItem } from '../types';

export const RoomCard = ({ room, onJoin, disabled }: { room: RoomListItem; onJoin: () => void; disabled: boolean }) => (
  <li className="card">
    <strong>{room.roomName}</strong> <span>{room.roomCode}</span>
    <div>{room.playersCount}/{room.maxPlayers} players · {room.status}</div>
    <button disabled={disabled || room.status !== 'waiting'} onClick={onJoin}>Join</button>
  </li>
);
