import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';
import { PeerModule } from './peerjs/peerjs.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PeerModule, AiModule],
  controllers: [AppController],
  providers: [AppGateway, AppService],
})
export class AppModule {}
