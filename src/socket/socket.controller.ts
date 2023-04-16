import { Controller } from '@nestjs/common';
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Controller()
@WebSocketGateway()
export class SocketController {
  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinRoom')
  handleJoinRoom(client: any, payload: any): void {
    client.join(payload.room);
    this.server.to(payload.room).emit('userJoined', `${payload.username} joined the room`);
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(client: any, payload: any): void {
    client.leave(payload.room);
    this.server.to(payload.room).emit('userLeft', `${payload.username} left the room`);
  }

  @SubscribeMessage('makeMove')
  handleMakeMove(client: any, payload: any): void {
    const { from, to } = payload;
    // Execute game logic for making a move
    this.server.to(payload.room).emit('moveMade', { from, to });
  }
}
