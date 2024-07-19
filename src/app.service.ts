import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  handleJoin(roomId: string): string {
    // Logic to handle joining a room
    return `Joined room ${roomId}`;
  }
}