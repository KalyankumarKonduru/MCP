export interface Message {
    _id?: string;
    content: string;
    role: 'user' | 'assistant';
    timestamp: Date;
    sessionId: string;
  }