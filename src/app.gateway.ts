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
import { AiService } from './ai/ai.service';

type PlayerSlots = Map<0 | 1, string | null>;

interface Room {
  players: number;
  pid: PlayerSlots;
  isAI: boolean;
  moves: MoveDto[];
  turn: 'w' | 'b';
}

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
  private rooms: Map<number, Room> = new Map();
  private nextRoomId = 1;

  constructor(
    private readonly peerService: PeerService,
    private readonly aiService: AiService,
  ) {}

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
    if (roomId !== null) {
      const room = this.rooms.get(roomId);
      if (room) {
        if (
          room.isAI &&
          (room.pid.get(0) === client.id || room.pid.get(1) === client.id)
        ) {
          this.rooms.delete(roomId);
          this.logger.log(
            `AI Room ${roomId} deleted as human player ${client.id} disconnected.`,
          );
          return;
        }

        room.players--;
        if (room.players <= 0) {
          this.rooms.delete(roomId);
          this.logger.log(`Room ${roomId} deleted as it is empty`);
        } else {
          const opponent = this.getOpponent(roomId, client.id);
          if (opponent) {
            if (opponent !== 'ai-player') {
              this.server.to(roomId.toString()).emit('room', room);
              this.server.to(opponent).emit('disconnected', client.id);
            }
          }
          if (room.pid.get(0) === client.id) {
            room.pid.set(0, null);
          } else if (room.pid.get(1) === client.id) {
            room.pid.set(1, null);
          }
        }
      }
    }
  }

  @SubscribeMessage('join')
  @ApiOperation({
    summary: 'Evento WebSocket: Entra ou cria uma sala de jogo',
  })
  @ApiBody({
    schema: {
      type: 'string',
      example: '123',
      description:
        'ID da sala para tentar entrar (opcional, numérico). Se vazio ou inválido, entra em uma sala disponível ou cria uma nova.',
    },
  })
  @ApiResponse({
    description:
      'Após entrar na sala, os eventos "room" e "player" são emitidos para o cliente. O ID da sala retornado será numérico.',
  })
  handleJoin(
    @MessageBody() roomIdString: string,
    @ConnectedSocket() client: Socket,
  ): void {
    const playerId = client.id;
    const { roomId, color } = this.findOrCreateRoom(roomIdString, playerId);

    client.join(roomId.toString());

    const roomData = this.rooms.get(roomId);
    if (roomData) {
      this.server.to(roomId.toString()).emit('room', {
        ...roomData,
        roomId,
        playerSlots: Object.fromEntries(roomData.pid.entries()),
      });
      client.emit('player', {
        playerId,
        players: roomData.players,
        color,
        roomId,
      });
    } else {
      this.logger.error(
        `Room ${roomId} not found after creation/join attempt for player ${playerId}`,
      );
      client.emit('status', {
        variant: 'danger',
        message: 'Erro ao entrar na sala. Tente novamente.',
      });
    }
  }

  @SubscribeMessage('start-ai-game')
  @ApiOperation({
    summary: 'Evento WebSocket: Inicia uma partida contra a IA',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        playerColor: {
          type: 'string',
          example: 'w',
          description: 'Cor desejada para o jogador humano ("w" ou "b")',
        },
      },
    },
  })
  @ApiResponse({
    description:
      'Confirma o início da partida contra a IA através do evento "ai-game-started". O ID da sala retornado será numérico.',
  })
  async startAIGame(
    @MessageBody() data: { playerColor: 'w' | 'b' },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const playerId = client.id;
    const playerColor = data.playerColor; // Human player's color
    const aiColor = playerColor === 'w' ? 'b' : 'w'; // AI player's color
    const AI_PLAYER_ID = 'ai-player';

    this.logger.log(`Client ${playerId} requested AI game as ${playerColor}`);

    for (const currentRoomStringId of client.rooms) {
      if (currentRoomStringId === client.id) {
        continue;
      }

      const numericRoomId = parseInt(currentRoomStringId, 10);
      if (!isNaN(numericRoomId) && this.rooms.has(numericRoomId)) {
        const roomToLeave = this.rooms.get(numericRoomId);
        if (roomToLeave) {
          roomToLeave.players--;
          if (roomToLeave.players <= 0) {
            this.rooms.delete(numericRoomId);
            this.logger.log(
              `Client ${playerId} left room ${numericRoomId} (now empty) when starting AI game.`,
            );
          } else {
            if (roomToLeave.pid.get(0) === playerId) {
              roomToLeave.pid.set(0, null);
            } else if (roomToLeave.pid.get(1) === playerId) {
              roomToLeave.pid.set(1, null);
            }
            this.logger.log(
              `Client ${playerId} left room ${numericRoomId}. Players remaining: ${roomToLeave.players}.`,
            );

            const opponentInOldRoom = this.getOpponent(numericRoomId, playerId);
            if (opponentInOldRoom && opponentInOldRoom !== AI_PLAYER_ID) {
              this.server.to(opponentInOldRoom).emit('room', roomToLeave);
              this.server.to(opponentInOldRoom).emit('disconnected', playerId);
            }
          }
        }
      }
      client.leave(currentRoomStringId);
    }

    const aiRoomId = this.nextRoomId++;
    this.rooms.set(aiRoomId, {
      players: 2,
      pid: new Map<0 | 1, string | null>([
        [0, playerColor === 'w' ? playerId : AI_PLAYER_ID],
        [1, playerColor === 'b' ? playerId : AI_PLAYER_ID],
      ]),
      isAI: true,
      moves: [],
      turn: 'w',
    });

    const room = this.rooms.get(aiRoomId);
    if (!room) {
      this.logger.error(
        `Failed to create AI room ${aiRoomId} for player ${playerId}`,
      );
      client.emit('status', {
        variant: 'danger',
        message: 'Erro ao iniciar partida contra a IA. Tente novamente.',
      });
      return;
    }

    client.join(aiRoomId.toString());

    this.logger.log(
      `Player ${playerId} started AI game in room ${aiRoomId} as ${playerColor}. Room state initialized.`,
    );

    client.emit('room', {
      roomId: aiRoomId,
      players: room.players,
      isAI: room.isAI,
      playerSlots: Object.fromEntries(room.pid.entries()),
    });

    client.emit('player', {
      playerId,
      players: room.players,
      color: playerColor,
      roomId: aiRoomId,
    });

    client.emit('opponent-data', {
      playerId: 'ai-player',
      color: aiColor,
      isAI: true,
      pieceSet: 'standard',
      pieceType: 'svg',
    });

    if (aiColor === 'w') {
      this.logger.log(
        `AI (White) is making the first move in room ${aiRoomId}`,
      );
      // Pass human player's color and AI player's color
      this.processPlayerMove(aiRoomId, AI_PLAYER_ID, playerColor, aiColor);
    }
  }

  private async processPlayerMove(
    roomId: number,
    playerId: string,
    humanPlayerColor: 'w' | 'b', // Added human player's color
    aiPlayerColor: 'w' | 'b', // Added AI player's color
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.error(`Attempted to process move for invalid room ${roomId}`);
      return;
    }

    const isAI = playerId === 'ai-player';
    const currentFen =
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    if (isAI) {
      this.logger.log(
        `Sending AI move request for room ${roomId} with FEN: ${currentFen}`,
      );
      const { aiMove, chatMessage } = await this.aiService.getAIMove(
        currentFen,
        humanPlayerColor,
        aiPlayerColor,
      );

      if (aiMove) {
        room.moves.push(aiMove);
        room.turn = room.turn === 'w' ? 'b' : 'w';
        this.logger.log(
          `AI move processed for room ${roomId}: ${aiMove.from}-${aiMove.to}. New turn: ${room.turn}`,
        );
        this.server.to(roomId.toString()).emit('move-received', aiMove);
      } else {
        this.logger.warn(`AI did not return a valid move for room ${roomId}`);
      }

      if (chatMessage) {
        this.server.to(roomId.toString()).emit('received-message', {
          sender: 'ai-player',
          text: chatMessage,
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      this.logger.warn(
        `processPlayerMove called for non-AI player ${playerId} in room ${roomId}. This should typically be handled by handleMove.`,
      );
    }
  }

  @SubscribeMessage('move')
  handleMove(
    @MessageBody() move: MoveDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const playerId = client.id;
    const roomId = this.findRoomByPlayerId(playerId);
    if (!roomId || !this.rooms.has(roomId)) {
      client.emit('status', {
        variant: 'danger',
        message: 'Sala não encontrada.',
      });
      return;
    }

    const room = this.rooms.get(roomId);
    const playerSlot = Array.from(room.pid.entries()).find(
      ([, id]) => id === playerId,
    )?.[0];
    const humanPlayerColor =
      playerSlot === 0 ? 'w' : playerSlot === 1 ? 'b' : null;

    if (room.turn !== humanPlayerColor) {
      client.emit('status', {
        variant: 'danger',
        message: 'Não é o seu turno.',
      });
      return;
    }

    room.moves.push(move);
    room.turn = humanPlayerColor === 'w' ? 'b' : 'w';

    this.server.to(roomId.toString()).emit('move-received', move);

    if (room.isAI) {
      const opponentId = Array.from(room.pid.values()).find(
        (id) => id !== playerId,
      );
      if (opponentId === 'ai-player') {
        const aiPlayerColor = humanPlayerColor === 'w' ? 'b' : 'w';
        // Pass human player's color and AI player's color
        this.processPlayerMove(
          roomId,
          'ai-player',
          humanPlayerColor,
          aiPlayerColor,
        );
      }
    }
  }

  @SubscribeMessage('send-message')
  @ApiOperation({
    summary: 'Evento WebSocket: Envia uma mensagem de chat',
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
      'Encaminha a mensagem para o oponente (humano ou IA) e envia de volta para o remetente.',
  })
  async handleMessage(
    @MessageBody() msg: string,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const roomId = this.findRoomByPlayerId(client.id);
    if (roomId === null) {
      this.logger.warn(`Message received from unknown player ${client.id}`);
      return;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.error(`Room ${roomId} not found for player ${client.id}`);
      return;
    }

    client.emit('message-sent', msg);

    const opponent = this.getOpponent(roomId, client.id);
    if (opponent) {
      if (room.isAI && opponent === 'ai-player') {
        this.logger.log(
          `Human player ${client.id} sent message to AI in room ${roomId}: "${msg}"`,
        );
      } else {
        this.server.to(opponent).emit('received-message', {
          sender: client.id,
          text: msg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  @SubscribeMessage('peer-ready')
  @ApiOperation({
    summary: 'Evento WebSocket: Informa que o PeerJS está pronto',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'number', example: 123 },
        peerId: { type: 'string', example: 'peer-456' },
      },
    },
  })
  @ApiResponse({
    description: 'Configura a conexão PeerJS para o cliente.',
  })
  handlePeerReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: number; peerId: string },
  ) {
    this.peerService.handlePeerConnection(client, data);
  }

  @SubscribeMessage('initiate-call')
  @ApiOperation({
    summary: 'Evento WebSocket: Inicia uma chamada de vídeo',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'number', example: 123 },
        peerId: { type: 'string', example: 'peer-456' },
      },
    },
  })
  @ApiResponse({
    description:
      'Notifica o oponente na sala através do evento "incoming-call".',
  })
  handleInitiateCall(
    @MessageBody() data: { roomId: number; peerId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { roomId, peerId } = data;
    const opponent = this.getOpponent(roomId, client.id);
    if (opponent && opponent !== 'ai-player') {
      this.server
        .to(opponent)
        .emit('incoming-call', { callerId: client.id, peerId });
      this.logger.log(
        `Emitting incoming-call event to ${opponent} in room ${roomId}`,
      );
    } else if (opponent === 'ai-player') {
      this.logger.log(
        `Player ${client.id} attempted to initiate call with AI in room ${roomId}. Ignoring.`,
      );
      client.emit('status', {
        variant: 'info',
        message: 'A IA não suporta chamadas de vídeo.',
      });
    }
  }

  @SubscribeMessage('call-ended')
  @ApiOperation({
    summary: 'Evento WebSocket: Finaliza uma chamada de vídeo',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        roomId: { type: 'number', example: 123 },
      },
    },
  })
  @ApiResponse({
    description: 'Notifica o oponente na sala através do evento "call-ended".',
  })
  handleCallEnded(
    @MessageBody() data: { roomId: number },
    @ConnectedSocket() client: Socket,
  ): void {
    const { roomId } = data;
    const opponent = this.getOpponent(roomId, client.id);
    if (opponent && opponent !== 'ai-player') {
      this.server.to(opponent).emit('call-ended', { callerId: client.id });
      this.logger.log(
        `Emitting call-ended event to ${opponent} in room ${roomId}`,
      );
    } else if (opponent === 'ai-player') {
      this.logger.log(
        `Player ${client.id} ended call with AI in room ${roomId}. Ignoring.`,
      );
    }
  }

  private findOrCreateRoom(
    roomIdString: string,
    playerId: string,
  ): { roomId: number; color: 'w' | 'b' } {
    let targetRoomId: number | null = null;
    let color: 'w' | 'b';

    const requestedRoomNumber = parseInt(roomIdString, 10);
    if (!isNaN(requestedRoomNumber) && this.rooms.has(requestedRoomNumber)) {
      const room = this.rooms.get(requestedRoomNumber);
      if (room && room.players < 2 && !room.isAI) {
        targetRoomId = requestedRoomNumber;
        this.logger.log(`Attempting to join specific room: ${targetRoomId}`);
      } else if (room) {
        this.logger.log(
          `Room ${requestedRoomNumber} is not joinable (full or AI). Looking for available room.`,
        );
      } else {
        this.logger.log(
          `Input roomId "${roomIdString}" is not a valid numeric ID or room does not exist. Looking for available room.`,
        );
      }
    } else if (roomIdString) {
      this.logger.log(
        `Input roomId "${roomIdString}" is not a valid numeric ID or room does not exist. Looking for available room.`,
      );
    } else {
      this.logger.log(
        `No specific roomId provided. Looking for available room.`,
      );
    }

    if (targetRoomId === null) {
      const existingRoomEntry = Array.from(this.rooms.entries()).find(
        ([, room]) => room.players < 2 && !room.isAI,
      );

      if (existingRoomEntry) {
        targetRoomId = existingRoomEntry[0];
        this.logger.log(`Found available room: ${targetRoomId}`);
      } else {
        targetRoomId = this.nextRoomId++;
        this.rooms.set(targetRoomId, {
          players: 0,
          pid: new Map<0 | 1, string | null>(),
          isAI: false,
          moves: [],
          turn: 'w',
        });
        this.logger.log(`Created new room: ${targetRoomId}`);
      }
    }

    const room = this.rooms.get(targetRoomId);
    if (!room) {
      this.logger.error(
        `Failed to retrieve room ${targetRoomId} immediately after creation/selection.`,
      );
      throw new Error(`Internal server error: Room ${targetRoomId} not found.`);
    }

    if (!room.pid.has(0) || room.pid.get(0) === null) {
      room.pid.set(0, playerId);
      color = 'w';
    } else if (!room.pid.has(1) || room.pid.get(1) === null) {
      room.pid.set(1, playerId);
      color = 'b';
    } else {
      this.logger.warn(
        `Attempted to add player ${playerId} to full room ${targetRoomId}. Player might already be in room.`,
      );
      if (room.pid.get(0) === playerId) {
        color = 'w';
      } else if (room.pid.get(1) === playerId) {
        color = 'b';
      } else {
        throw new Error(`Room ${targetRoomId} is full.`);
      }
    }

    const isPlayerAlreadyInRoom = Array.from(room.pid.values()).includes(
      playerId,
    );
    if (!isPlayerAlreadyInRoom || room.players === 0) {
      room.players++;
    }

    this.logger.log(
      `Player ${playerId} joined room ${targetRoomId} as ${color}. Players in room: ${room.players}`,
    );
    return { roomId: targetRoomId, color };
  }

  private findRoomByPlayerId(playerId: string): number | null {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.pid.get(0) === playerId || room.pid.get(1) === playerId) {
        return roomId;
      }
    }
    return null;
  }

  private getOpponent(roomId: number, playerId: string): string | null {
    const room = this.rooms.get(roomId);
    if (room) {
      const player1Id = room.pid.get(0);
      const player2Id = room.pid.get(1);

      if (player1Id === playerId) {
        return player2Id;
      } else if (player2Id === playerId) {
        return player1Id;
      }
    }
    return null;
  }
}
