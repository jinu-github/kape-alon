import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { eq, and, gt, lt } from 'drizzle-orm';
import type { db } from '../db/client.ts';
import { users, authSessions } from '../db/schema.ts';
import { ServiceError } from './errors.ts';
import { staffUserSchema } from '@kape/shared';
import type { StaffUser } from '@kape/shared';

export type AuthConfig = {
  secret: string;
  production: boolean;
  demoMode: boolean;
  demoPassword?: string;
};
export type AuthStore = {
  findByEmail: (
    email: string,
  ) => Promise<
    | {
        id: string;
        email: string;
        role: 'admin' | 'kitchen';
        passwordHash: string;
      }
    | undefined
  >;
  createSession: (id: string, userId: string, expiresAt: Date) => Promise<void>;
  readSession: (id: string, userId: string) => Promise<StaffUser | undefined>;
  deleteSession: (id: string) => Promise<void>;
  demoUser: (role: 'admin' | 'kitchen') => Promise<StaffUser | undefined>;
};
export function databaseAuthStore(database: typeof db): AuthStore {
  return {
    findByEmail: async (email) =>
      (await database.select().from(users).where(eq(users.email, email)))[0],
    createSession: async (id, userId, expiresAt) => {
      await database
        .delete(authSessions)
        .where(lt(authSessions.expiresAt, new Date()));
      await database.insert(authSessions).values({ id, userId, expiresAt });
    },
    readSession: async (id, userId) => {
      const [record] = await database
        .select({ id: users.id, email: users.email, role: users.role })
        .from(authSessions)
        .innerJoin(users, eq(users.id, authSessions.userId))
        .where(
          and(
            eq(authSessions.id, id),
            eq(users.id, userId),
            gt(authSessions.expiresAt, new Date()),
          ),
        );
      return record;
    },
    deleteSession: async (id) => {
      await database.delete(authSessions).where(eq(authSessions.id, id));
    },
    demoUser: async (role) => {
      const [record] = await database
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.role, role))
        .limit(1);
      return record;
    },
  };
}
export function createAuthService(store: AuthStore, config: AuthConfig) {
  const secret = new TextEncoder().encode(
    z.string().min(32).parse(config.secret),
  );
  const cookieName = config.production ? '__Host-kape_session' : 'kape_session';
  const lifetime = 8 * 60 * 60;
  const events = new EventEmitter();
  const dummyHash = bcrypt.hash(randomUUID(), 12);
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: config.production ? ('none' as const) : ('lax' as const),
    path: '/',
  };
  function readCookie(header?: string) {
    return header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
  }
  async function login(email: string, password: string) {
    const user = await store.findByEmail(email);
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? (await dummyHash),
    );
    if (!user || !valid)
      throw new ServiceError(
        401,
        'INVALID_CREDENTIALS',
        'Email or password is incorrect.',
      );
    const id = randomUUID();
    const expires = Math.floor(Date.now() / 1000) + lifetime;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setJti(id)
      .setIssuer('kape-api')
      .setAudience('kape-staff')
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(secret);
    await store.createSession(id, user.id, new Date(expires * 1000));
    return { token, user: staffUserSchema.parse(user) };
  }
  async function authenticate(header?: string) {
    const token = readCookie(header);
    if (!token)
      throw new ServiceError(
        401,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
      );
    let claims;
    try {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'kape-api',
        audience: 'kape-staff',
        typ: 'JWT',
      });
      claims = z
        .object({ sub: z.uuid(), jti: z.uuid(), exp: z.number() })
        .parse(payload);
    } catch {
      throw new ServiceError(
        401,
        'UNAUTHENTICATED',
        'Your session has expired. Please sign in again.',
      );
    }
    const user = await store.readSession(claims.jti, claims.sub);
    if (!user)
      throw new ServiceError(
        401,
        'UNAUTHENTICATED',
        'Your session has ended. Please sign in again.',
      );
    return {
      user: staffUserSchema.parse(user),
      sessionId: claims.jti,
      expiresAt: claims.exp * 1000,
    };
  }
  async function logout(header?: string) {
    try {
      const session = await authenticate(header);
      await store.deleteSession(session.sessionId);
      events.emit('revoked', session.sessionId);
    } catch (error) {
      if (!(error instanceof ServiceError && error.status === 401)) throw error;
    }
  }
  async function demoAccess(role: 'admin' | 'kitchen') {
    if (!config.demoMode || !config.demoPassword)
      throw new ServiceError(
        404,
        'DEMO_DISABLED',
        'Demo autofill is disabled. Enter your staff credentials.',
      );
    const user = await store.demoUser(role);
    if (!user)
      throw new ServiceError(
        404,
        'DEMO_UNAVAILABLE',
        'The demo account is unavailable.',
      );
    return { email: user.email, password: config.demoPassword };
  }
  return {
    login,
    authenticate,
    logout,
    demoAccess,
    events,
    cookieName,
    cookieOptions,
    maxAge: lifetime * 1000,
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
