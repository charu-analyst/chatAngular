import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface Message {
  id?: number;
  text: string;
  session_id?: string;
  sender?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private apiBase = 'http://localhost:3000'; // backend URL
  private socket: Socket;
  private messageSubject = new Subject<Message>();
  private typingSubject = new Subject<boolean>(); // NEW: for typing indicator
  private sessionId = '';

  constructor(private http: HttpClient) {
    if (typeof window !== 'undefined') {
      this.sessionId = localStorage.getItem('sessionId') || '';
    }
    
    this.socket = io(this.apiBase, { transports: ['websocket'] });
    
    /** 🔥 Receive session id from backend on first connection */
    this.socket.on('session_created', (data: any) => {
      console.log('%cSESSION CREATED: ', 'color:green', data.sessionId);
      this.sessionId = data.sessionId;
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('sessionId', data.sessionId);
      }
    });

    /** Get previous chat history */
    this.socket.on('chat_history', (messages: Message[]) => {
      messages.forEach((m) => this.messageSubject.next(m));
    });

    /** Listen for new messages from server */
    this.socket.on('newMessage', (message: Message) => {
      console.log('🔔 Received newMessage from backend:', message);
      console.log('   - Sender:', message.sender);
      console.log('   - Text:', message.text);
      this.messageSubject.next(message);
    });

    /** NEW: Listen for admin typing indicator (optional) */
    this.socket.on('admin_typing', (isTyping: boolean) => {
      this.typingSubject.next(isTyping);
    });
  }

  /** Send message to server */
  sendMessage(text: string): void {
    console.log('📤 Sending message:', text, 'with sessionId:', this.sessionId);
    this.socket.emit('message', { text, sessionId: this.sessionId });
  }

  /** Observable for new incoming messages */
  getMessages(): Observable<Message> {
    return this.messageSubject.asObservable();
  }

  /** NEW: Observable for typing indicator */
  getTypingStatus(): Observable<boolean> {
    return this.typingSubject.asObservable();
  }

  /** Load message history from REST endpoint */
  getHistory(): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.apiBase}/messages/${this.sessionId}`);
  }

  /** Get current session ID */
  getSessionId(): string {
    return this.sessionId;
  }
}