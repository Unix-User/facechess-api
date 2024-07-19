import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';
import { PeerjsModule } from './peerjs/peerjs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PeerjsModule,
  ],
  providers: [AppGateway],
})
export class AppModule {}