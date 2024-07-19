import { SubscribeMessage, WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'my-custom-header'],
    credentials: true,
  },
})
export class AppGateway {
  @WebSocketServer()
  server: Server;

  private rooms: Map<string, any> = new Map();

  @SubscribeMessage('join')
  handleJoin(@MessageBody() roomId: string, @ConnectedSocket() client: Socket): void {
    const playerId = client.id;
    const { roomId: newRoomId, color } = this.findOrCreateRoom(roomId, playerId);
    
    client.join(newRoomId);
    
    this.server.to(newRoomId).emit('room', this.rooms.get(newRoomId));
    client.emit('player', { playerId, players: this.rooms.get(newRoomId).players, color, roomId: newRoomId });
  }

  @SubscribeMessage('move')
  handleMove(@MessageBody() move: any, @ConnectedSocket() client: Socket): void {
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId) {
      const opponent = this.getOpponent(roomId, client.id);
      if (opponent) {
        this.server.to(opponent).emit('move-received', move);
      }
    }
  }

  @SubscribeMessage('send-message')
  handleMessage(@MessageBody() msg: any, @ConnectedSocket() client: Socket): void {
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId) {
      const opponent = this.getOpponent(roomId, client.id);
      if (opponent) {
        this.server.to(opponent).emit('received-message', msg);
      }
    }
    client.emit('message-sent', msg);
  }

  private findOrCreateRoom(roomId: string, playerId: string): { roomId: string, color: string } {
    let found = false;
    let newRoomId = roomId;
    let color: string;

    for (const [id, room] of this.rooms.entries()) {
      if (room.players < 2) {
        newRoomId = id;
        found = true;
        break;
      }
    }

    if (!found) {
      newRoomId = this.rooms.size.toString();
      this.rooms.set(newRoomId, { players: 0, pid: new Map() });
    }

    const room = this.rooms.get(newRoomId);
    for (let i = 0; i < 2; i++) {
      if (!room.pid.has(i)) {
        room.pid.set(i, playerId);
        color = i === 0 ? 'w' : 'b';
        break;
      }
    }

    room.players++;
    return { roomId: newRoomId, color };
  }

  private findRoomByPlayerId(playerId: string): string | null {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.pid.get(0) === playerId || room.pid.get(1) === playerId) {
        return roomId;
      }
    }
    return null;
  }

  private getOpponent(roomId: string, playerId: string): string | null {
    const room = this.rooms.get(roomId);
    if (room) {
      return room.pid.get(0) === playerId ? room.pid.get(1) : room.pid.get(0);
    }
    return null;
  }
}