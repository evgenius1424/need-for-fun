import type { Logger } from 'pino';
import type { Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      log?: Logger;
    }
    interface Application {
      locals: {
        sseSubscribe: (roomCode: string, playerId: string, res: Response) => void;
      };
    }
  }
}

export {};
