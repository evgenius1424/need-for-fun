import { createServer } from 'http';
import { createApp } from './app.js';
import { startWs } from './ws/roomWsServer.js';

let broadcaster: Awaited<ReturnType<typeof startWs>> | undefined;
const { app, roomService, sessions, tokenSvc } = createApp(async (roomCode, type) => broadcaster?.broadcastRoom(roomCode, type));
const server = createServer(app);
broadcaster = startWs(server, roomService, sessions, tokenSvc);

server.listen(3000, () => {
  console.log('Lobby server listening on :3000');
});
