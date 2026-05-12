import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global ValidationPipe:
  //   - whitelist:           strip fields not declared on the DTO
  //   - forbidNonWhitelisted: reject requests carrying unknown fields with 400
  //     (this is what enforces "display_order is not patchable" from RFC §5.1)
  //   - transform:           run class-transformer so types coerce correctly
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
