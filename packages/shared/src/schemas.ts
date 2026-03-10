import { z } from 'zod';

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z0-9 _-]+$/, 'Display name contains unsupported characters');

export const roomNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9 _-]+$/, 'Room name contains unsupported characters');

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);

export const createRoomRequestSchema = z.object({
  displayName: displayNameSchema,
  roomName: roomNameSchema.optional(),
});

export const joinRoomRequestSchema = z.object({
  displayName: displayNameSchema,
});

export const playerSnapshotSchema = z.object({
  playerId: z.string().uuid(),
  displayName: z.string(),
  role: z.enum(['host', 'player']),
  connected: z.boolean(),
});

export const roomSnapshotSchema = z.object({
  roomCode: roomCodeSchema,
  roomName: z.string(),
  status: z.enum(['waiting', 'in_game']),
  players: z.array(playerSnapshotSchema),
  maxPlayers: z.number().int().positive(),
});

export const wsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.subscribe'), roomCode: roomCodeSchema }),
  z.object({ type: z.literal('ping') }),
]);

export const wsServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('room.snapshot'), payload: roomSnapshotSchema }),
  z.object({ type: z.literal('room.updated'), payload: roomSnapshotSchema }),
  z.object({ type: z.literal('room.started'), payload: roomSnapshotSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>;
