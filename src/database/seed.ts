import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Component } from '../modules/components/entities/component.entity';
import { Profile } from '../modules/components/entities/profile.entity';

/**
 * Seeds demo data so the API has something to hit:
 *   - One profile belonging to user DEMO_USER_ID
 *   - Three components on that profile in order: About, Links, Experience
 *
 * Idempotent: if the profile already exists it deletes its components and
 * re-creates them. Safe to run repeatedly during a demo.
 *
 * The hardcoded UUIDs are chosen so you can copy-paste them into curl
 * without coordinating with the DB.
 */
const DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_PROFILE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMP_1 = 'c0000000-0000-0000-0000-000000000001';
const COMP_2 = 'c0000000-0000-0000-0000-000000000002';
const COMP_3 = 'c0000000-0000-0000-0000-000000000003';

async function seed() {
  const ds = new DataSource(
  process.env.DATABASE_URL
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        entities: [Component, Profile],
        synchronize: true,
      }
    : {
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        username: process.env.DB_USER ?? 'openprofile',
        password: process.env.DB_PASSWORD ?? 'openprofile',
        database: process.env.DB_NAME ?? 'openprofile',
        entities: [Component, Profile],
        synchronize: true,
      },
);

  await ds.initialize();
  console.log('Connected to DB');

  const profilesRepo = ds.getRepository(Profile);
  const componentsRepo = ds.getRepository(Component);

  // Upsert the profile
  let profile = await profilesRepo.findOne({ where: { id: DEMO_PROFILE_ID } });
  if (!profile) {
    profile = profilesRepo.create({
      id: DEMO_PROFILE_ID,
      user_id: DEMO_USER_ID,
      deleted_at: null,
    });
    await profilesRepo.save(profile);
    console.log(`Created profile ${DEMO_PROFILE_ID} for user ${DEMO_USER_ID}`);
  } else {
    console.log(`Profile ${DEMO_PROFILE_ID} already exists; resetting components`);
    await componentsRepo.delete({ profile_id: DEMO_PROFILE_ID });
  }

  // Re-seed three components in order
  const components: Partial<Component>[] = [
    {
      id: COMP_1,
      profile_id: DEMO_PROFILE_ID,
      section_type: 'about',
      title: 'About me',
      content: 'I build things on the internet.',
      metadata: null,
      is_enabled: true,
      display_order: 0,
    },
    {
      id: COMP_2,
      profile_id: DEMO_PROFILE_ID,
      section_type: 'links',
      title: 'Links',
      content: 'Twitter, GitHub, LinkedIn',
      metadata: null,
      is_enabled: true,
      display_order: 1,
    },
    {
      id: COMP_3,
      profile_id: DEMO_PROFILE_ID,
      section_type: 'experience',
      title: 'Experience',
      content: 'Software engineer, 2020–present.',
      metadata: null,
      is_enabled: true,
      display_order: 2,
    },
  ];

  for (const c of components) {
    await componentsRepo.save(componentsRepo.create(c));
  }

  console.log('\n=== SEEDED ===');
  console.log(`User ID (for x-user-id header): ${DEMO_USER_ID}`);
  console.log(`Profile ID:                     ${DEMO_PROFILE_ID}`);
  console.log(`Component IDs:`);
  console.log(`  About:       ${COMP_1}`);
  console.log(`  Links:       ${COMP_2}`);
  console.log(`  Experience:  ${COMP_3}`);
  console.log('==============\n');

  await ds.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
