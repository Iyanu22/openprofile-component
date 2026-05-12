import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ComponentsModule } from './modules/components/components.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
  type: 'postgres',
  url: config.get<string>('DATABASE_URL'),  // Railway provides this
  host: config.get<string>('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 5432),
  username: config.get<string>('DB_USER', 'openprofile'),
  password: config.get<string>('DB_PASSWORD', 'openprofile'),
  database: config.get<string>('DB_NAME', 'openprofile'),
  ssl: config.get<string>('NODE_ENV') === 'production'
    ? { rejectUnauthorized: false }
    : false,
  autoLoadEntities: true,
  synchronize: config.get<string>('NODE_ENV') !== 'production',
}),
    }),
    ComponentsModule,
  ],
})
export class AppModule {}
