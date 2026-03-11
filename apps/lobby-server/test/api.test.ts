import request from 'supertest';
import { createServer } from 'http';
import { describe, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('api flow', () => {
  it('create/start/leave and protects SSE endpoint', async () => {
    const { app } = createApp();
    const server = createServer(app);
    const agent = request.agent(server);

    await agent.get('/api/rooms/ABCDEF/events').expect(401);

    const csrf = await agent.get('/api/csrf');
    const token = csrf.body.csrfToken;
    const created = await agent.post('/api/rooms').set('x-csrf-token', token).send({ displayName: 'Alice' }).expect(201);
    await agent.get(`/api/rooms/${created.body.room.roomCode}/events`).expect(200);
    await agent.post(`/api/rooms/${created.body.room.roomCode}/start`).set('x-csrf-token', token).send({}).expect(200);
    await agent.post(`/api/rooms/${created.body.room.roomCode}/leave`).set('x-csrf-token', token).send({}).expect(204);
  });
});
