import { Mongo } from 'meteor/mongo';

export interface ChatSession {
  _id?: string;
  title: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: string;
  messageCount: number;
  isActive: boolean;
  metadata?: {
    patientId?: string;
    documentIds?: string[];
    tags?: string[];
    model?: string;
    temperature?: number;
  };
}

export const SessionsCollection = new Mongo.Collection<ChatSession>('sessions');