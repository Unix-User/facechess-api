import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';
import { PeerModule } from './peerjs/peerjs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PeerModule,
  ],
  providers: [AppGateway],
})
export class AppModule {}