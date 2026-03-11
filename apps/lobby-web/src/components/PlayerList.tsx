import type { Player } from '../types';

export const PlayerList = ({ players }: { players: Player[] }) => <ul>{players.map((p) => <li key={p.playerId}>{p.displayName} {p.role === 'host' ? '(host)' : ''}</li>)}</ul>;
