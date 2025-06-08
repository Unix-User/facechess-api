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
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { MoveDto } from './game/dto/move.dto';

@ApiTags('Game Gateway')
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

  private readonly logger = new Logger(AppGateway.name);
  private rooms: Map<string, any> = new Map();

  constructor(private readonly peerService: PeerService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket server initialized');
    this.peerService.setServer(server);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId) {
      const room = this.rooms.get(roomId);
      room.players--;
      if (room.players === 0) {
        this.rooms.delete(roomId);
        this.logger.log(`Room ${roomId} deleted as it is empty`);
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
  @ApiOperation({
    summary: 'Evento WebSocket: Entra ou cria uma sala de jogo',
    description: `Para testar:
1. Conecte-se ao WebSocket.
2. Envie o evento 'join' com o ID da sala desejada.
3. Exemplo de payload: "sala-123"
4. Resposta esperada: Eventos 'room' (com dados da sala) e 'player' (com dados do jogador, incluindo ID, cor e ID da sala) serão emitidos para o cliente. Se a sala for nova ou tiver menos de 2 jogadores, o cliente entrará nela.`,
  })
  @ApiBody({
    schema: {
      type: 'string',
      example: 'sala-123',
      description: 'ID da sala para entrar ou criar',
    },
  })
  @ApiResponse({
    description:
      'Após entrar na sala, os eventos "room" e "player" são emitidos para o cliente. Exemplo "room": { players: number, pid: { [index: string]: string | null } }. Exemplo "player": { playerId: string, players: number, color: "w" | "b", roomId: string }',
  })
  handleJoin(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    const playerId = client.id;
    const { roomId: newRoomId, color } = this.findOrCreateRoom(
      roomId,
      playerId,
    );

    client.join(newRoomId);

    const roomData = this.rooms.get(newRoomId);
    this.server.to(newRoomId).emit('room', roomData);
    client.emit('player', {
      playerId,
      players: roomData.players,
      color,
      roomId: newRoomId,
    });
  }

  @SubscribeMessage('move')
  @ApiOperation({
    summary: 'Evento WebSocket: Envia um movimento de xadrez',
    description: `Para testar:
1. Conecte-se ao WebSocket.
2. Entre em uma sala ('join' event).
3. Envie o evento 'move' com os dados do movimento.
4. Exemplo de payload: { "from": "e2", "to": "e4", "piece": "p", "promotion": null } (usando a estrutura de MoveDto)
5. Resposta esperada: O evento 'move-received' com os dados do movimento será emitido para o oponente na mesma sala.`,
  })
  @ApiBody({ type: MoveDto })
  @ApiResponse({
    description:
      'Encaminha o movimento para o oponente através do evento "move-received". O payload é o mesmo que o enviado (MoveDto). Exemplo: { "from": "e2", "to": "e4", "piece": "p", "promotion": null }',
  })
  handleMove(
    @MessageBody() move: MoveDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId) {
      const opponent = this.getOpponent(roomId, client.id);
      if (opponent) {
        this.server.to(opponent).emit('move-received', move);
      }
    }
  }

  @SubscribeMessage('send-message')
  @ApiOperation({
    summary: 'Evento WebSocket: Envia uma mensagem de chat',
    description: `Para testar:
1. Conecte-se ao WebSocket.
2. Entre em uma sala ('join' event).
3. Envie o evento 'send-message' com o conteúdo da mensagem.
4. Exemplo de payload: "Olá, oponente!"
5. Resposta esperada: O evento 'received-message' com a mensagem será emitido para o oponente. O evento 'message-sent' será emitido de volta para o remetente.`,
  })
  @ApiBody({
    schema: {
      type: 'string',
      example: 'Olá, oponente!',
      description: 'Conteúdo da mensagem de chat',
    },
  })
  @ApiResponse({
    description:
      'Encaminha a mensagem para o oponente através do evento "received-message" e envia de volta para o remetente através do evento "message-sent". Ambos os eventos têm o payload como a string da mensagem. Exemplo: "Olá, oponente!"',
  })
  handleMessage(
    @MessageBody() msg: string,
    @ConnectedSocket() client: Socket,
  ): void {
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
  @ApiOperation({
    summary: 'Evento WebSocket: Informa que o PeerJS está pronto',
    description: `Para testar:
1. Conecte-se ao WebSocket
2. Entre em uma sala
3. Envie o evento 'peer-ready' com os dados
4. Exemplo de payload: { "roomId": "sala-123", "peerId": "peer-456" }
5. Resposta esperada:
   - Conexão PeerJS configurada`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string', example: 'sala-123' },
        peerId: { type: 'string', example: 'peer-456' },
      },
    },
  })
  @ApiResponse({
    description:
      'Configura a conexão PeerJS para o cliente. Não há evento de resposta padrão, a configuração ocorre internamente.',
  })
  handlePeerReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; peerId: string },
  ) {
    this.peerService.handlePeerConnection(client, data);
  }

  @SubscribeMessage('initiate-call')
  @ApiOperation({
    summary: 'Evento WebSocket: Inicia uma chamada de vídeo',
    description: `Para testar:
1. Conecte-se ao WebSocket
2. Entre em uma sala
3. Envie o evento 'initiate-call' com os dados
4. Exemplo de payload: { "roomId": "sala-123", "peerId": "peer-456" }
5. Resposta esperada:
   - Evento 'incoming-call' para o oponente`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string', example: 'sala-123' },
        peerId: { type: 'string', example: 'peer-456' },
      },
    },
  })
  @ApiResponse({
    description:
      'Notifica o oponente na sala através do evento "incoming-call". Payload: { callerId: string, peerId: string }. Exemplo: { "callerId": "clienteId1", "peerId": "peer-456" }',
  })
  handleInitiateCall(
    @MessageBody() data: { roomId: string; peerId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { roomId, peerId } = data;
    const opponent = this.getOpponent(roomId, client.id);
    if (opponent) {
      this.server
        .to(opponent)
        .emit('incoming-call', { callerId: client.id, peerId });
      this.logger.log(`Emitting incoming-call event to ${opponent}`);
    }
  }

  @SubscribeMessage('call-ended')
  @ApiOperation({
    summary: 'Evento WebSocket: Finaliza uma chamada de vídeo',
    description: `Para testar:
1. Conecte-se ao WebSocket.
2. Entre em uma sala ('join' event).
3. (Opcional: Inicie uma chamada com 'initiate-call').
4. Envie o evento 'call-ended' com o ID da sala.
5. Exemplo de payload: { "roomId": "sala-123" }
6. Resposta esperada: O evento 'call-ended' com o ID do chamador será emitido para o oponente.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'string', example: 'sala-123' },
      },
    },
  })
  @ApiResponse({
    description:
      'Notifica o oponente na sala através do evento "call-ended". Payload: { callerId: string }. Exemplo: { "callerId": "clienteId1" }',
  })
  handleCallEnded(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { roomId } = data;
    const opponent = this.getOpponent(roomId, client.id);
    if (opponent) {
      this.server.to(opponent).emit('call-ended', { callerId: client.id });
      this.logger.log(`Emitting call-ended event to ${opponent}`);
    }
  }

  private findOrCreateRoom(
    roomId: string,
    playerId: string,
  ): { roomId: string; color: string } {
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
