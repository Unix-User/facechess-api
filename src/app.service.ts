import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  handleJoin(roomId: string): string {
    return `Joined room ${roomId}`;
  }
}
