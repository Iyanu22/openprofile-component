import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { PatchComponentDto } from './dto/patch-component.dto';
import { ReorderComponentsDto } from './dto/reorder-components.dto';
import { Component } from './entities/component.entity';
import { Profile } from './entities/profile.entity';
import { ComponentSetMismatchException } from './exceptions/component-set-mismatch.exception';

@Injectable()
export class ComponentsService {
  private readonly logger = new Logger(ComponentsService.name);

  constructor(
    @InjectRepository(Component)
    private readonly componentsRepo: Repository<Component>,
    @InjectRepository(Profile)
    private readonly profilesRepo: Repository<Profile>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * PATCH a single component. Ownership is checked by joining through the
   * profile: the component's profile must belong to the requesting user.
   *
   * Returns 404 if the component doesn't exist, 403 if it exists but belongs
   * to a different user. The distinction matters because returning 404 for
   * both would leak existence info, but returning 403 for non-existent IDs
   * would falsely imply they exist somewhere. RFC §5.1 specifies both codes,
   * so we honour the distinction.
   */
  async patchComponent(
    userId: string,
    componentId: string,
    dto: PatchComponentDto,
  ): Promise<Component> {
    const component = await this.componentsRepo.findOne({
      where: { id: componentId },
    });

    if (!component) {
      throw new NotFoundException(`Component ${componentId} not found.`);
    }

    const profile = await this.profilesRepo.findOne({
      where: { id: component.profile_id },
    });

    // If the profile is gone (soft-deleted or hard-deleted), the component is
    // effectively orphaned. Treat as 404 rather than 403 — there's no owner
    // to forbid against.
    if (!profile || profile.deleted_at !== null) {
      throw new NotFoundException(`Component ${componentId} not found.`);
    }

    if (profile.user_id !== userId) {
      throw new ForbiddenException(
        'Component does not belong to the authenticated user.',
      );
    }

    // Apply only the fields the DTO actually carries. We don't spread the
    // whole DTO because that would set undefined keys explicitly, which
    // TypeORM's save() interprets as "set this column to null".
    if (dto.is_enabled !== undefined) component.is_enabled = dto.is_enabled;
    if (dto.title !== undefined) component.title = dto.title;
    if (dto.content !== undefined) component.content = dto.content;
    if (dto.metadata !== undefined) component.metadata = dto.metadata;

    return this.componentsRepo.save(component);
  }

  /**
   * PUT /components/order — replace the full ordering for a profile in one
   * atomic write.
   *
   * Algorithm (RFC §2):
   *   1. Resolve the user's profile.
   *   2. BEGIN TRANSACTION.
   *   3. SELECT id FROM components WHERE profile_id = $1 FOR UPDATE
   *      — locks all the profile's component rows for the duration of the
   *      transaction, so concurrent reorders for the same profile serialize.
   *   4. Verify the submitted ID set equals the loaded ID set exactly. If
   *      not, throw 409 with the diff.
   *   5. One UPDATE ... FROM (VALUES ...) sets all new display_order values
   *      in a single round-trip.
   *   6. COMMIT.
   *
   * Why FOR UPDATE and not optimistic locking: optimistic locking would
   * require a version column on `components`, which isn't in the schema, and
   * the failure mode (retry from the client) is worse UX for drag-and-drop
   * than the rare lock wait. Profile-scoped locking has effectively zero
   * contention in practice (single editor per profile).
   */
  async reorderComponents(
    userId: string,
    dto: ReorderComponentsDto,
  ): Promise<Component[]> {
    const submittedIds = dto.component_ids;

    // Profile lookup happens outside the transaction — it's a read-only
    // ownership check and doesn't need to hold a row lock.
    const profile = await this.profilesRepo.findOne({
      where: { user_id: userId, deleted_at: null as unknown as Date },
    });

    if (!profile) {
      throw new NotFoundException('Profile not found for user.');
    }

    return this.dataSource.transaction(async (manager) => {
      const componentsRepo = manager.getRepository(Component);

      // Lock every component for this profile. Locking by profile_id rather
      // than by submitted IDs ensures we also detect "submitted ID belongs
      // to no row in this profile" — those IDs simply won't appear in the
      // locked set.
      const currentComponents = await componentsRepo
        .createQueryBuilder('c')
        .where('c.profile_id = :profileId', { profileId: profile.id })
        .setLock('pessimistic_write')
        .getMany();

      const currentIds = new Set(currentComponents.map((c) => c.id));
      const submittedSet = new Set(submittedIds);

      // Cross-profile check: any submitted ID that exists in the DB but on
      // a different profile is a 403 (information-disclosure / permission
      // violation), not a 409 (set mismatch). We have to look those up
      // separately because the locked query is scoped to this profile.
      const foreignIds = submittedIds.filter((id) => !currentIds.has(id));
      if (foreignIds.length > 0) {
        const foreignRows = await componentsRepo.find({
          where: { id: In(foreignIds) },
          select: ['id'],
        });
        if (foreignRows.length > 0) {
          throw new ForbiddenException(
            'One or more component_ids belong to a different profile.',
          );
        }
      }

      // Set-equality check. After the cross-profile check above, any
      // remaining mismatch is a 409 — the client's view of the profile is
      // stale (component added/removed in another tab).
      const missing = [...currentIds].filter((id) => !submittedSet.has(id));
      const extra = submittedIds.filter((id) => !currentIds.has(id));
      if (missing.length > 0 || extra.length > 0) {
        throw new ComponentSetMismatchException(missing, extra);
      }

      // One UPDATE per row would be N round-trips. Postgres lets us do this
      // as a single statement with `UPDATE ... FROM (VALUES ...)`. We build
      // the VALUES list parameterised — never string-interpolated — to keep
      // it injection-safe.
      const values = submittedIds.map((_, i) => `($${i * 2 + 1}::uuid, $${i * 2 + 2}::int)`).join(', ');
      const params: (string | number)[] = [];
      submittedIds.forEach((id, i) => {
        params.push(id, i);
      });
      // updated_at is bumped to NOW() for every reordered row.
      await manager.query(
        `
        UPDATE components AS c
        SET display_order = v.new_order,
            updated_at = NOW()
        FROM (VALUES ${values}) AS v(id, new_order)
        WHERE c.id = v.id
        `,
        params,
      );

      // Return the new ordering. We re-select inside the transaction so the
      // response reflects the committed state (well, the about-to-be-
      // committed state — same thing from the client's perspective).
      const reordered = await componentsRepo
        .createQueryBuilder('c')
        .where('c.profile_id = :profileId', { profileId: profile.id })
        .orderBy('c.display_order', 'ASC')
        .getMany();

      this.logger.log(
        `Reordered ${reordered.length} components for profile ${profile.id}`,
      );

      return reordered;
    });
  }
}
