import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { Component } from '../modules/components/entities/component.entity';
import { Profile } from '../modules/components/entities/profile.entity';

/**
 * Standalone DataSource for the TypeORM CLI (migrations, seed scripts).
 * Mirrors the runtime config in AppModule but doesn't pull in the rest of
 * Nest — useful for tooling.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'openprofile',
  password: process.env.DB_PASSWORD ?? 'openprofile',
  database: process.env.DB_NAME ?? 'openprofile',
  entities: [Component, Profile],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});
