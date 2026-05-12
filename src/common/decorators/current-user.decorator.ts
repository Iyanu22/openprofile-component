import { ExecutionContext, createParamDecorator } from '@nestjs/common';

/**
 * Extracts the authenticated user (or one of its fields) from the request.
 * Usage: @CurrentUser('id') userId: string
 *
 * Assumes the auth guard has populated req.user. Stub for the components
 * module — replace with the existing project decorator.
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    return data ? user?.[data] : user;
  },
);
