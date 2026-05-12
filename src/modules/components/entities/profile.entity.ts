import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Minimal Profile entity stub. The full Profile entity is owned by the
 * Profile Creation track; this only contains the fields the Components
 * module reads (id, user_id) for the ownership check.
 *
 * In the real codebase this would be imported from the profiles module.
 */
@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  user_id!: string;

  @Column({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}
