import { ConflictException } from '@nestjs/common';

/**
 * Thrown when the IDs submitted to PUT /components/order don't match the
 * profile's current component set exactly. Per RFC §5.2 the response body
 * includes the diff so the client can refetch and retry.
 */
export class ComponentSetMismatchException extends ConflictException {
  constructor(missing: string[], extra: string[]) {
    super({
      statusCode: 409,
      error: 'Conflict',
      message: 'Submitted component IDs do not match the profile current set.',
      // `missing`: IDs present on the profile but not in the submitted array
      //            (likely added in another tab since the client last fetched).
      // `extra`:   IDs in the submitted array but not on the profile
      //            (likely deleted in another tab, or never belonged here).
      missing,
      extra,
    });
  }
}
