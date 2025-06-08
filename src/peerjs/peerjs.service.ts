import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class PeerService {
  private server: Server;
  private rooms: Map<string, Set<string>> = new Map();

  constructor() {}

  setServer(server: Server) {
    this.server = server;
  }

  handlePeerConnection(client: any, data: any) {
    const { roomId, peerId } = data;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(peerId);

    client.join(roomId);
    this.server.to(roomId).emit('peer-connected', { peerId });
  }

  handleDisconnect(client: any, roomId: string, peerId: string) {
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(peerId);
      if (this.rooms.get(roomId).size === 0) {
        this.rooms.delete(roomId);
      }
    }

    client.leave(roomId);
    this.server.to(roomId).emit('peer-disconnected', { peerId });
  }

  getPeersInRoom(roomId: string): string[] {
    return Array.from(this.rooms.get(roomId) || []);
  }
}
