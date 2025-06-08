import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';
import { PeerModule } from './peerjs/peerjs.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PeerModule],
  controllers: [AppController],
  providers: [AppGateway, AppService],
})
export class AppModule {}
