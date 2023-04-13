import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { SocketModule } from './socket/socket.module';

@Module({
  imports: [ChatModule, SocketModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
