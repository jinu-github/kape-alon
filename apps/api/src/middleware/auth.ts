import type { RequestHandler } from 'express';
import type { StaffUser } from '@kape/shared';
import type { AuthService } from '../services/auth.ts';
import { ServiceError } from '../services/errors.ts';

export function requireRole(
  auth: AuthService,
  ...roles: StaffUser['role'][]
): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.authenticate(req.headers.cookie);
    if (!roles.includes(session.user.role))
      throw new ServiceError(
        403,
        'FORBIDDEN',
        'This account cannot access this page.',
      );
    res.locals.staff = session.user;
    next();
  };
}
export function requireStaffOrigin(origin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.headers.origin !== origin)
      throw new ServiceError(
        403,
        'ORIGIN_DENIED',
        'Please use the cafe website to make this request.',
      );
    next();
  };
}
