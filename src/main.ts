import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  let corsOrigin = configService.get<string>('CORS_ORIGIN') || 3001;
  if (!corsOrigin) {
    throw new Error('CORS_ORIGIN is not defined in the configuration');
  }

  const corsOptions = {
    origin: String(corsOrigin).split(','),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };

  app.enableCors(corsOptions);
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = configService.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();