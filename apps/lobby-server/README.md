# Lobby server

Production-oriented prototype backend for multiplayer lobby/room flow.

## Security architecture
- **Split identity model**: room code is public navigation key; session JWT (HttpOnly cookie) is player identity.
- **Authoritative backend**: room membership, host role, and room state are only mutated server-side.
- **Validation**: zod validation on REST params/body and websocket messages.
- **CSRF**: double-submit token (`/api/csrf` + `x-csrf-token`) for all mutating cookie-auth routes.
- **Rate limiting** on room list/create/join.
- **Security headers** via helmet, strict CORS origin, JSON payload limit.
- **Safe errors** with stable `{ error: { code, message } }` format.

## Persistence strategy
Current implementation uses in-memory repositories behind interfaces (`RoomRepository`, `PlayerSessionRepository`) so migration to Postgres/Redis is straightforward without changing domain services.

## Host/cleanup rules
- Host leaving transfers host role to first remaining player.
- Empty rooms are deleted.

## Reconnect and duplicate prevention
- `POST /api/rooms/:roomCode/join` now restores an existing valid session for that room rather than creating duplicate player rows.
- WebSocket broadcasts are room-scoped so room snapshots are never leaked across rooms.

## Run
```bash
npm run lobby:dev
```
