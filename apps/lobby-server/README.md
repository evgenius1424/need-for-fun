# Lobby app backend (REST + SSE)

Production-oriented prototype backend for multiplayer lobby/room flow.

## Why SSE instead of WebSocket
- For room management updates (join/leave/status), SSE is enough: server-to-client push with simpler lifecycle and fewer moving parts.
- The browser `EventSource` automatically reconnects.
- Auth remains cookie-based and server-authoritative.

## Security architecture
- **Split identity model**: room code is public navigation key; session JWT (HttpOnly cookie) is player identity.
- **Authoritative backend**: room membership, host role, and room state are only mutated server-side.
- **Validation**: zod validation on REST params/body.
- **CSRF**: double-submit token (`/api/csrf` + `x-csrf-token`) for all mutating cookie-auth routes.
- **Rate limiting** on room list/create/join.
- **Security headers** via helmet, strict CORS, JSON payload limit.
- **Safe errors** with stable `{ error: { code, message } }` format.

## Single app deployment model
`apps/lobby-server` now serves both API and built SPA assets (`apps/lobby-web/dist`) from the same origin.
That gives a single deployable app while keeping frontend/backend code separated by folder and modules.

## Persistence strategy
Current implementation uses in-memory repositories behind interfaces (`RoomRepository`, `PlayerSessionRepository`) so migration to Postgres/Redis is straightforward without changing domain services.

## Host/cleanup rules
- Host leaving transfers host role to first remaining player.
- Empty rooms are deleted.
