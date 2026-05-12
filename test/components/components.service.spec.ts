import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ComponentsService } from '../../src/modules/components/components.service';
import { Component } from '../../src/modules/components/entities/component.entity';
import { Profile } from '../../src/modules/components/entities/profile.entity';
import { ComponentSetMismatchException } from '../../src/modules/components/exceptions/component-set-mismatch.exception';

/**
 * In-memory stand-in for the components/profiles tables + a fake transaction
 * manager. This lets us exercise the service's logic — set-equality, foreign-
 * ID detection, ordering math — without spinning up Postgres for unit tests.
 * Lock semantics are tested separately in the integration suite.
 */
class FakeDb {
  components: Component[] = [];
  profiles: Profile[] = [];
  lockedProfileIds: string[] = []; // observability for tests
  queries: { sql: string; params: unknown[] }[] = [];

  reset() {
    this.components = [];
    this.profiles = [];
    this.lockedProfileIds = [];
    this.queries = [];
  }
}

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const PROFILE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeComponent(overrides: Partial<Component>): Component {
  return {
    id: overrides.id!,
    profile_id: overrides.profile_id ?? PROFILE_A,
    section_type: overrides.section_type ?? 'links',
    title: overrides.title ?? null,
    content: overrides.content ?? null,
    metadata: overrides.metadata ?? null,
    is_enabled: overrides.is_enabled ?? true,
    display_order: overrides.display_order ?? 0,
    updated_at: overrides.updated_at ?? new Date('2026-01-01'),
  } as Component;
}

describe('ComponentsService', () => {
  let service: ComponentsService;
  const db = new FakeDb();

  // Fake Component repo
  const componentsRepo: Partial<Repository<Component>> = {
    findOne: jest.fn(async ({ where }: any) => {
      return db.components.find((c) => c.id === where.id) ?? null;
    }),
    save: jest.fn(async (c: any) => {
      const i = db.components.findIndex((x) => x.id === c.id);
      // Bump updated_at to simulate @UpdateDateColumn
      const saved = { ...c, updated_at: new Date('2026-06-01') };
      if (i >= 0) db.components[i] = saved;
      return saved;
    }),
  };

  // Fake Profile repo
  const profilesRepo: Partial<Repository<Profile>> = {
    findOne: jest.fn(async ({ where }: any) => {
      return (
        db.profiles.find((p) => {
          if (where.id && p.id !== where.id) return false;
          if (where.user_id && p.user_id !== where.user_id) return false;
          if ('deleted_at' in where && p.deleted_at !== where.deleted_at)
            return false;
          return true;
        }) ?? null
      );
    }),
  };

  // Fake transactional manager. Returns a getRepository that yields a
  // QueryBuilder mock for the locked SELECT, and a `query` method that
  // simulates the UPDATE ... FROM (VALUES ...) by applying the new orders
  // to the in-memory rows.
  const dataSource: Partial<DataSource> = {
    transaction: jest.fn(async (cb: any) => {
      const manager = {
        getRepository: () => ({
          createQueryBuilder: () => {
            const state = { profileId: '', orderBy: '' };
            const qb: any = {
              where: (_clause: string, params: any) => {
                state.profileId = params.profileId;
                return qb;
              },
              setLock: (_kind: string) => {
                db.lockedProfileIds.push(state.profileId);
                return qb;
              },
              orderBy: (col: string, dir: string) => {
                state.orderBy = `${col} ${dir}`;
                return qb;
              },
              getMany: async () => {
                const rows = db.components.filter(
                  (c) => c.profile_id === state.profileId,
                );
                if (state.orderBy.includes('display_order')) {
                  rows.sort((a, b) => a.display_order - b.display_order);
                }
                return rows;
              },
            };
            return qb;
          },
          find: async ({ where }: any) => {
            const ids: string[] = where.id._value ?? where.id.value ?? [];
            return db.components.filter((c) => ids.includes(c.id));
          },
        }),
        query: async (sql: string, params: any[]) => {
          db.queries.push({ sql, params });
          // params are [id0, order0, id1, order1, ...]
          for (let i = 0; i < params.length; i += 2) {
            const id = params[i] as string;
            const newOrder = params[i + 1] as number;
            const row = db.components.find((c) => c.id === id);
            if (row) {
              row.display_order = newOrder;
              row.updated_at = new Date('2026-06-01');
            }
          }
          return [];
        },
      };
      return cb(manager);
    }),
  };

  // Patch the In(...) shape we read in the fake repo
  // (TypeORM's In(...) returns an object; we just need the values)
  jest.mock('typeorm', () => {
    const actual = jest.requireActual('typeorm');
    return {
      ...actual,
      In: (vals: any[]) => ({ _value: vals, _type: 'in' }),
    };
  });

  beforeEach(async () => {
    db.reset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComponentsService,
        { provide: getRepositoryToken(Component), useValue: componentsRepo },
        { provide: getRepositoryToken(Profile), useValue: profilesRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<ComponentsService>(ComponentsService);

    // Seed: user A owns profile A with 3 components in order; user B owns
    // profile B with 1 component.
    db.profiles.push({
      id: PROFILE_A,
      user_id: USER_A,
      deleted_at: null,
    } as Profile);
    db.profiles.push({
      id: PROFILE_B,
      user_id: USER_B,
      deleted_at: null,
    } as Profile);

    db.components.push(
      makeComponent({
        id: 'c0000000-0000-0000-0000-000000000001',
        profile_id: PROFILE_A,
        display_order: 0,
        title: 'About',
      }),
      makeComponent({
        id: 'c0000000-0000-0000-0000-000000000002',
        profile_id: PROFILE_A,
        display_order: 1,
        title: 'Links',
      }),
      makeComponent({
        id: 'c0000000-0000-0000-0000-000000000003',
        profile_id: PROFILE_A,
        display_order: 2,
        title: 'Experience',
      }),
      makeComponent({
        id: 'd0000000-0000-0000-0000-000000000001',
        profile_id: PROFILE_B,
        display_order: 0,
        title: "B's About",
      }),
    );
  });

  // ---------------- patchComponent ----------------

  describe('patchComponent', () => {
    it('toggles is_enabled and bumps updated_at (RFC DoD #3)', async () => {
      const before = db.components[0].updated_at.getTime();
      const result = await service.patchComponent(
        USER_A,
        'c0000000-0000-0000-0000-000000000001',
        { is_enabled: false },
      );
      expect(result.is_enabled).toBe(false);
      expect(result.updated_at.getTime()).toBeGreaterThan(before);
    });

    it('does not overwrite fields the DTO omits', async () => {
      const original = db.components[0];
      const result = await service.patchComponent(
        USER_A,
        'c0000000-0000-0000-0000-000000000001',
        { is_enabled: false },
      );
      expect(result.title).toBe(original.title);
      expect(result.content).toBe(original.content);
    });

    it('returns 403 when the component belongs to another user (RFC §5.1)', async () => {
      await expect(
        service.patchComponent(
          USER_A,
          'd0000000-0000-0000-0000-000000000001', // B's component
          { is_enabled: false },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns 404 for a component ID that does not exist (RFC §5.1)', async () => {
      await expect(
        service.patchComponent(
          USER_A,
          '00000000-0000-0000-0000-000000000099',
          { is_enabled: false },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------- reorderComponents ----------------

  describe('reorderComponents', () => {
    it('reverses the order and produces a dense 0..N-1 sequence (RFC DoD #3, #5)', async () => {
      const result = await service.reorderComponents(USER_A, {
        component_ids: [
          'c0000000-0000-0000-0000-000000000003',
          'c0000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000001',
        ],
      });

      expect(result.map((c) => c.display_order)).toEqual([0, 1, 2]);
      expect(result.map((c) => c.id)).toEqual([
        'c0000000-0000-0000-0000-000000000003',
        'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000001',
      ]);
    });

    it('acquires a pessimistic_write lock on the profile (RFC DoD #2)', async () => {
      await service.reorderComponents(USER_A, {
        component_ids: [
          'c0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000003',
        ],
      });
      expect(db.lockedProfileIds).toContain(PROFILE_A);
    });

    it('uses a single UPDATE statement for all rows (RFC §2)', async () => {
      await service.reorderComponents(USER_A, {
        component_ids: [
          'c0000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000003',
        ],
      });
      expect(db.queries).toHaveLength(1);
      expect(db.queries[0].sql).toContain('UPDATE components');
      expect(db.queries[0].sql).toContain('FROM (VALUES');
    });

    it('throws 409 with a diff when an ID is missing (RFC §5.2)', async () => {
      try {
        await service.reorderComponents(USER_A, {
          component_ids: [
            'c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000002',
            // missing component 3
          ],
        });
        fail('expected ComponentSetMismatchException');
      } catch (err) {
        expect(err).toBeInstanceOf(ComponentSetMismatchException);
        const body = (err as ComponentSetMismatchException).getResponse() as any;
        expect(body.missing).toEqual([
          'c0000000-0000-0000-0000-000000000003',
        ]);
        expect(body.extra).toEqual([]);
      }
    });

    it('throws 409 when an extra ID is included that does not exist anywhere', async () => {
      try {
        await service.reorderComponents(USER_A, {
          component_ids: [
            'c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000002',
            'c0000000-0000-0000-0000-000000000003',
            'c0000000-0000-0000-0000-0000000000ff', // does not exist
          ],
        });
        fail('expected ComponentSetMismatchException');
      } catch (err) {
        expect(err).toBeInstanceOf(ComponentSetMismatchException);
        const body = (err as ComponentSetMismatchException).getResponse() as any;
        expect(body.extra).toEqual([
          'c0000000-0000-0000-0000-0000000000ff',
        ]);
      }
    });

    it('throws 403 when an ID belongs to a different profile (RFC §5.2)', async () => {
      await expect(
        service.reorderComponents(USER_A, {
          component_ids: [
            'c0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000002',
            'c0000000-0000-0000-0000-000000000003',
            'd0000000-0000-0000-0000-000000000001', // belongs to B
          ],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 404 when the user has no profile', async () => {
      await expect(
        service.reorderComponents(
          '99999999-9999-9999-9999-999999999999',
          { component_ids: ['c0000000-0000-0000-0000-000000000001'] },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('public read order: post-reorder, ASC display_order matches request order (RFC DoD #6)', async () => {
      const newOrder = [
        'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000003',
        'c0000000-0000-0000-0000-000000000001',
      ];
      await service.reorderComponents(USER_A, { component_ids: newOrder });

      // Simulate the public profile read: filter is_enabled and sort ASC
      const publicView = db.components
        .filter((c) => c.profile_id === PROFILE_A && c.is_enabled)
        .sort((a, b) => a.display_order - b.display_order)
        .map((c) => c.id);

      expect(publicView).toEqual(newOrder);
    });

    it('disabled components are still part of the ordering but filtered by public read', async () => {
      // Disable one component, then reorder including it
      await service.patchComponent(
        USER_A,
        'c0000000-0000-0000-0000-000000000002',
        { is_enabled: false },
      );
      await service.reorderComponents(USER_A, {
        component_ids: [
          'c0000000-0000-0000-0000-000000000002',
          'c0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000003',
        ],
      });

      // Editor view includes all 3
      const editorView = db.components
        .filter((c) => c.profile_id === PROFILE_A)
        .sort((a, b) => a.display_order - b.display_order);
      expect(editorView.map((c) => c.id)).toEqual([
        'c0000000-0000-0000-0000-000000000002',
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003',
      ]);

      // Public view skips the disabled one but preserves relative order
      const publicView = editorView
        .filter((c) => c.is_enabled)
        .map((c) => c.id);
      expect(publicView).toEqual([
        'c0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000003',
      ]);
    });
  });
});
