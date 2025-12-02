import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'other';
  timestamp: string;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('messagesList') private messagesList!: ElementRef;

  messages: Message[] = [
    { id: 1, text: 'Hey! How can I help you today?', sender: 'other', timestamp: '10:30 AM' },
    { id: 2, text: 'I need help with my biodata template', sender: 'user', timestamp: '10:31 AM' },
    { id: 3, text: 'Sure! I can help you customize your template. What would you like to change?', sender: 'other', timestamp: '10:32 AM' }
  ];

  newMessage: string = '';
  private shouldScroll = false;

  ngOnInit(): void {
    this.shouldScroll = true;
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  scrollToBottom(): void {
    try {
      this.messagesList.nativeElement.scrollTop = this.messagesList.nativeElement.scrollHeight;
    } catch (err) {
      console.error('Error scrolling:', err);
    }
  }

  sendMessage(): void {
    if (this.newMessage.trim()) {
      const message: Message = {
        id: this.messages.length + 1,
        text: this.newMessage,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      console.log("message=====",message);
      this.messages.push(message);
      console.log("this.messages=====",this.messages);
      
      this.newMessage = '';
      this.shouldScroll = true;
    }
  }

  handleKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}