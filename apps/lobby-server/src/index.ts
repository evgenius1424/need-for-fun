import { createServer } from 'http';
import { createApp } from './app.js';

const { app } = createApp();
const server = createServer(app);

server.listen(3000, () => {
  console.log('Lobby app listening on :3000');
});
