import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { Observable, Subject } from 'rxjs';

interface ChatMessage {
  user: string;
  message: string;
}

@Injectable()
export class ChatService {
  private users: string[] = [];
  private messages: ChatMessage[] = [];
  private messagesSubject = new Subject<ChatMessage>();

  constructor(private io: Server) {}

  public sendMessage(message: ChatMessage) {
    this.messages.push(message);
    this.io.emit('message', message);
  }

  public getMessages(): Observable<ChatMessage> {
    return this.messagesSubject.asObservable();
  }

  public addUser(user: string) {
    this.users.push(user);
    this.io.emit('userList', this.users);
  }

  public removeUser(user: string) {
    const index = this.users.indexOf(user);
    if (index !== -1) {
      this.users.splice(index, 1);
      this.io.emit('userList', this.users);
    }
  }

  public getAllUsers() {
    return this.users;
  }

  public setUserList(users: string[]) {
    this.users = users;
    this.io.emit('userList', this.users);
  }

  public setMessageList(messages: ChatMessage[]) {
    this.messages = messages;
    for (const message of messages) {
      this.messagesSubject.next(message);
    }
  }
}

