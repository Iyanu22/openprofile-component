import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Mirrors the `components` table from the DBML.
 *
 * NOTE: A unique partial index on (profile_id, display_order) is created via
 * migration, not via @Index here, because TypeORM's decorator-driven unique
 * index doesn't support `WHERE` clauses (we need to scope uniqueness to
 * non-deleted rows once soft-delete is introduced). See migration
 * 1715000000000-AddComponentsOrderingIndex.ts.
 */
@Entity({ name: 'components' })
@Index('idx_components_profile_order', ['profile_id', 'display_order'])
export class Component {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  profile_id!: string;

  @Column({ type: 'varchar', length: 64 })
  section_type!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  is_enabled!: boolean;

  @Column({ type: 'integer' })
  display_order!: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
