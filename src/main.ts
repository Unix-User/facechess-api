import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as socketio from 'socket.io';
import * as dotenv from 'dotenv';
import { config } from './app.config';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);

  app.useWebSocketAdapter(new IoAdapter(app));

  const { port, url } = config;
  const server = await app.listen(port, () => {
    console.log(`Server is running on ${url}:${port}`);
  });
  const io = new socketio.Server(server);
  io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });
}

bootstrap();

