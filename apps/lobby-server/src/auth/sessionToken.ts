import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

export class SessionTokenService {
  constructor(private readonly secret: string) {}

  async sign(sessionId: string, exp: Date): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(encoder.encode(this.secret));
  }

  async verify(token: string): Promise<{ sid: string } | null> {
    try {
      const result = await jwtVerify(token, encoder.encode(this.secret), { algorithms: ['HS256'] });
      if (typeof result.payload.sid !== 'string') return null;
      return { sid: result.payload.sid };
    } catch {
      return null;
    }
  }
}
