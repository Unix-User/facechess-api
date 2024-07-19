import { Module } from '@nestjs/common';
import { PeerService } from './peerjs.service';

@Module({
  providers: [PeerService],
  exports: [PeerService],
})
export class PeerModule {}