import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MoveDto } from './game/dto/move.dto';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const corsOrigin =
    configService.get<string>('CORS_ORIGIN') ||
    'http://localhost:8080,http://127.0.0.1:8080';

  const corsOptions = {
    origin: corsOrigin.split(','),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };

  app.enableCors(corsOptions);
  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('FaceChess API')
    .setDescription('Documentação da API do FaceChess')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [MoveDto],
  });

  SwaggerModule.setup('api', app, document);

  const port = configService.get('PORT') || 3001;
  const host = configService.get<string>('HOST') || 'localhost';

  await app.listen(port);

  const baseUrl = `http://${host}:${port}`;
  const swaggerUrl = `${baseUrl}/api`;

  logger.log(`Aplicação está rodando em: ${baseUrl}`);
  logger.log(`Documentação da API (Swagger) em: ${swaggerUrl}`);
}

bootstrap();
