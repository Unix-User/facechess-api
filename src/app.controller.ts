import { Controller, Get, Render } from '@nestjs/common';
import { ChatGateway } from './chat/chat.gateway';

@Controller()
export class AppController {
  constructor(private readonly chatGateway: ChatGateway) {}

  @Get()
  @Render('index')
  root() {}

  @Get('chat')
  @Render('chat')
  chat() {}
}
