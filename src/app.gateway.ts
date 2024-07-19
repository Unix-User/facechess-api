import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PeerService } from './peerjs/peerjs.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'my-custom-header'],
    credentials: true,
  },
})
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private rooms: Map<string, any> = new Map();

  constructor(private readonly peerService: PeerService) {}

  afterInit(server: Server) {
    console.log('WebSocket server initialized');
    this.peerService.setServer(server);
  }

  handleConnection(client: Socket, ...args: any[]) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId) {
      const room = this.rooms.get(roomId);
      room.players--;
      if (room.players === 0) {
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} deleted as it is empty`);
      } else {
        const opponent = this.getOpponent(roomId, client.id);
        if (opponent) {
          this.server.to(opponent).emit('room', room);
          this.server.to(opponent).emit('disconnected', client.id);
        }
        room.pid.forEach((value, key) => {
          if (value === client.id) {
            room.pid.set(key, null);
          }
        });
      }
    }
  }

  @SubscribeMessage('join')
  handleJoin(@MessageBody() roomId: string, @ConnectedSocket() client: Socket): void {
    const playerId = client.id;
    const { roomId: newRoomId, color } = this.findOrCreateRoom(roomId, playerId);
    
    client.join(newRoomId);
    
    const roomData = this.rooms.get(newRoomId);
    this.server.to(newRoomId).emit('room', roomData);
    client.emit('player', { playerId, players: roomData.players, color, roomId: newRoomId });
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

  @SubscribeMessage('peer-ready')
  handlePeerReady(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    this.peerService.handlePeerConnection(client, data);
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