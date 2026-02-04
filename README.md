# Need For Fun 🕹️

**Need For Fun** is a small experimental **2D arena deathmatch**

It’s inspired by the _feel_ of classic fast-paced arena shooters — tight movement, skill-based combat, and simple
rules

Think:  
**Quake-like mechanics → 2D grid**

## Server Architecture

- Threading model: each game room runs as a dedicated Tokio task (actor model).  
  WebSocket clients have one reader task and one writer task.
- Backpressure strategy: outbound per-client channel is bounded (`OUTBOUND_CHANNEL_CAPACITY`).  
  If a client cannot keep up, the room drops that client (disconnect policy) instead of buffering indefinitely.
- Snapshot flow: room tick reuses scratch buffers, encodes directly into `BytesMut`, freezes to `Bytes`, then broadcasts cheap `Bytes` clones.  
  The only unavoidable copy is the final Axum WebSocket boundary (`Bytes -> Vec<u8>`).
