import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket, ...args: any[]) {
    console.log(`Client connected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, room: string): Observable<string> {
    client.join(room);
    return from([`Joined room ${room}`]);
  }

  @SubscribeMessage('leave')
  handleLeave(client: Socket, room: string): Observable<string> {
    client.leave(room);
    return from([`Left room ${room}`]);
  }

  @SubscribeMessage('message')
  handleMessage(client: Socket, message: string, room: string): Observable<string> {
    this.server.to(room).emit('message', message);
    return from([message]);
  }
}
