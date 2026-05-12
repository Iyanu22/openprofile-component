import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Stub guard for the components module. In the real codebase this is owned
 * by the auth track and validates the access token, sets req.user, etc.
 * Replace with the existing project guard.
 *
 * DEMO MODE: this implementation reads `x-user-id` from the request headers
 * so the local demo can be driven by curl without a real auth service. The
 * downstream contract (req.user.id is a UUID string) is identical to what
 * the production JwtAuthGuard supplies.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // If something upstream already populated req.user (e.g. a real auth
    // middleware in the integration target), respect it.
    if (req.user && req.user.id) {
      return true;
    }

    const userId = req.headers['x-user-id'];
    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException(
        'Missing x-user-id header (demo mode).',
      );
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      throw new UnauthorizedException(
        'x-user-id must be a UUID (demo mode).',
      );
    }

    req.user = { id: userId };
    return true;
  }
}
