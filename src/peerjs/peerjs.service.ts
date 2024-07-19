import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class PeerService {
  private server: Server;

  constructor() {}

  setServer(server: Server) {
    this.server = server;
  }

  handlePeerConnection(client: any, data: any) {
    const { roomId, peerId } = data;
    client.to(roomId).emit('peer-connected', { peerId });
  }
}