import { Mongo } from 'meteor/mongo';

export interface Message {
  _id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  sessionId: string;
}

export const MessagesCollection = new Mongo.Collection<Message>('messages');