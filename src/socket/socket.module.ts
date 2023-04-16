import { Module } from '@nestjs/common';
import { SocketController } from './socket.controller';

@Module({
  controllers: [SocketController],
})
export class SocketModule {}
