import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [AppGateway],
})
export class AppModule {}