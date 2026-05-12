import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds an index on (profile_id, display_order) to support:
 *
 *   1. The public profile read query, which filters by profile_id and
 *      orders by display_order.
 *   2. The reorder service's `SELECT ... FOR UPDATE` lock query, which
 *      uses the same predicate.
 *
 * This is a plain B-tree index, NOT a unique index. Per RFC §6 we don't
 * have soft-delete on components yet, so technically we could enforce
 * uniqueness on (profile_id, display_order) at the DB level — but doing
 * so would make the reorder UPDATE statement order-sensitive (you can't
 * have two rows briefly sharing a display_order during the swap). We
 * keep uniqueness as an application-level invariant enforced by the
 * reorder transaction.
 *
 * DIVERGENCE FROM RFC §6: The RFC noted uniqueness as a "definition of
 * done" check. We're enforcing it via the reorder transaction + tests
 * rather than a DB constraint. Reason documented above.
 */
export class AddComponentsOrderingIndex1715000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_components_profile_order
       ON components (profile_id, display_order)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_components_profile_order`,
    );
  }
}
