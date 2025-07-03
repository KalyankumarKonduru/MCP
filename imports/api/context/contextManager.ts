import { MessagesCollection, Message } from '../messages/messages';
import { SessionsCollection } from '../sessions/sessions';

export interface ConversationContext {
  sessionId: string;
  recentMessages: Message[];
  patientContext?: string;
  documentContext?: string[];
  medicalEntities?: Array<{text: string, label: string}>;
  maxContextLength: number;
  totalTokens: number;
}

export class ContextManager {
  private static contexts = new Map<string, ConversationContext>();
  private static readonly MAX_CONTEXT_LENGTH = 4000; // Adjust based on model
  private static readonly MAX_MESSAGES = 20;
  
  static async getContext(sessionId: string): Promise<ConversationContext> {
    let context = this.contexts.get(sessionId);
    
    if (!context) {
      // Load context from database
      context = await this.loadContextFromDB(sessionId);
      this.contexts.set(sessionId, context);
    }
    
    return context;
  }
  
  private static async loadContextFromDB(sessionId: string): Promise<ConversationContext> {
    // Load recent messages
    const recentMessages = await MessagesCollection.find(
      { sessionId },
      { 
        sort: { timestamp: -1 }, 
        limit: this.MAX_MESSAGES 
      }
    ).fetchAsync();
    
    // Load session metadata
    const session = await SessionsCollection.findOneAsync(sessionId);
    
    const context: ConversationContext = {
      sessionId,
      recentMessages: recentMessages.reverse(),
      maxContextLength: this.MAX_CONTEXT_LENGTH,
      totalTokens: 0
    };
    
    // Add metadata from session
    if (session?.metadata) {
      context.patientContext = session.metadata.patientId;
      context.documentContext = session.metadata.documentIds;
    }
    
    // Extract medical entities from recent messages
    context.medicalEntities = this.extractMedicalEntities(recentMessages);
    
    // Calculate token usage
    context.totalTokens = this.calculateTokens(context);
    
    // Trim if needed
    this.trimContext(context);
    
    return context;
  }
  
  static async updateContext(sessionId: string, newMessage: Message) {
    const context = await this.getContext(sessionId);
    
    // Add new message
    context.recentMessages.push(newMessage);
    
    // Update medical entities if message contains them
    if (newMessage.role === 'assistant') {
      const entities = this.extractEntitiesFromMessage(newMessage.content);
      if (entities.length > 0) {
        context.medicalEntities = [
          ...(context.medicalEntities || []),
          ...entities
        ].slice(-50); // Keep last 50 entities
      }
    }
    
    // Recalculate tokens and trim
    context.totalTokens = this.calculateTokens(context);
    this.trimContext(context);
    
    this.contexts.set(sessionId, context);
    
    // Persist important context back to session
    await this.persistContext(sessionId, context);
  }
  
  private static trimContext(context: ConversationContext) {
    while (context.totalTokens > context.maxContextLength && context.recentMessages.length > 2) {
      // Remove oldest messages, but keep at least 2
      context.recentMessages.shift();
      context.totalTokens = this.calculateTokens(context);
    }
  }
  
  private static calculateTokens(context: ConversationContext): number {
    // Rough estimation: 1 token ≈ 4 characters
    let totalChars = 0;
    
    // Count message content
    totalChars += context.recentMessages
      .map(msg => msg.content)
      .join(' ').length;
    
    // Count metadata
    if (context.patientContext) {
      totalChars += context.patientContext.length + 20; // Include label
    }
    
    if (context.documentContext) {
      totalChars += context.documentContext.join(' ').length + 30;
    }
    
    if (context.medicalEntities) {
      totalChars += context.medicalEntities
        .map(e => `${e.text} (${e.label})`)
        .join(', ').length;
    }
    
    return Math.ceil(totalChars / 4);
  }
  
  static buildContextPrompt(context: ConversationContext): string {
    const parts: string[] = [];
    
    // Add patient context
    if (context.patientContext) {
      parts.push(`Current Patient: ${context.patientContext}`);
    }
    
    // Add document context
    if (context.documentContext && context.documentContext.length > 0) {
      parts.push(`Related Documents: ${context.documentContext.slice(0, 5).join(', ')}`);
    }
    
    // Add medical entities summary
    if (context.medicalEntities && context.medicalEntities.length > 0) {
      const entitySummary = this.summarizeMedicalEntities(context.medicalEntities);
      parts.push(`Medical Context: ${entitySummary}`);
    }
    
    // Add conversation history
    if (context.recentMessages.length > 0) {
      const conversation = context.recentMessages
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');
      
      parts.push(`Recent Conversation:\n${conversation}`);
    }
    
    return parts.join('\n\n');
  }
  
  private static summarizeMedicalEntities(entities: Array<{text: string, label: string}>): string {
    const grouped = entities.reduce((acc, entity) => {
      if (!acc[entity.label]) {
        acc[entity.label] = [];
      }
      acc[entity.label].push(entity.text);
      return acc;
    }, {} as Record<string, string[]>);
    
    const summary = Object.entries(grouped)
      .map(([label, texts]) => {
        const unique = [...new Set(texts)].slice(0, 5);
        return `${label}: ${unique.join(', ')}`;
      })
      .join('; ');
    
    return summary;
  }
  
  private static extractMedicalEntities(messages: Message[]): Array<{text: string, label: string}> {
    const entities: Array<{text: string, label: string}> = [];
    
    // Simple extraction - look for patterns
    const patterns = {
      MEDICATION: /\b(medication|medicine|drug|prescription):\s*([^,.]+)/gi,
      CONDITION: /\b(diagnosis|condition|disease):\s*([^,.]+)/gi,
      SYMPTOM: /\b(symptom|complain):\s*([^,.]+)/gi,
    };
    
    messages.forEach(msg => {
      Object.entries(patterns).forEach(([label, pattern]) => {
        let match;
        while ((match = pattern.exec(msg.content)) !== null) {
          entities.push({
            text: match[2].trim(),
            label
          });
        }
      });
    });
    
    return entities;
  }
  
  private static extractEntitiesFromMessage(content: string): Array<{text: string, label: string}> {
    const entities: Array<{text: string, label: string}> = [];
    
    // Look for medical terms in the response
    const medicalTerms = {
      MEDICATION: ['medication', 'prescribed', 'dosage', 'mg', 'tablets'],
      CONDITION: ['diagnosis', 'condition', 'syndrome', 'disease'],
      PROCEDURE: ['surgery', 'procedure', 'test', 'examination'],
      SYMPTOM: ['pain', 'fever', 'nausea', 'fatigue']
    };
    
    Object.entries(medicalTerms).forEach(([label, terms]) => {
      terms.forEach(term => {
        if (content.toLowerCase().includes(term)) {
          // Extract the sentence containing the term
          const sentences = content.split(/[.!?]/);
          sentences.forEach(sentence => {
            if (sentence.toLowerCase().includes(term)) {
              const extracted = sentence.trim().substring(0, 100);
              if (extracted) {
                entities.push({ text: extracted, label });
              }
            }
          });
        }
      });
    });
    
    return entities;
  }
  
  private static async persistContext(sessionId: string, context: ConversationContext) {
    // Update session with latest context metadata
    await SessionsCollection.updateAsync(sessionId, {
      $set: {
        'metadata.patientId': context.patientContext,
        'metadata.documentIds': context.documentContext,
        'metadata.lastEntities': context.medicalEntities?.slice(-10),
        lastMessage: context.recentMessages[context.recentMessages.length - 1]?.content.substring(0, 100),
        messageCount: await MessagesCollection.countDocuments({ sessionId }),
        updatedAt: new Date()
      }
    });
  }
  
  static clearContext(sessionId: string) {
    this.contexts.delete(sessionId);
  }
  
  static clearAllContexts() {
    this.contexts.clear();
  }
  
  static getContextStats(sessionId: string): { size: number; messages: number; tokens: number } | null {
    const context = this.contexts.get(sessionId);
    if (!context) return null;
    
    return {
      size: this.contexts.size,
      messages: context.recentMessages.length,
      tokens: context.totalTokens
    };
  }
}