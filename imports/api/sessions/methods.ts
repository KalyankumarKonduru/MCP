import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { SessionsCollection, ChatSession } from './sessions';
import { MessagesCollection } from '../messages/messages';

Meteor.methods({
  async 'sessions.create'(title?: string, metadata?: any) {
    check(title, Match.Maybe(String));
    check(metadata, Match.Maybe(Object));

    const session: Omit<ChatSession, '_id'> = {
      title: title || 'New Chat',
      userId: this.userId || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      isActive: true,
      metadata: metadata || {}
    };
    
    // Deactivate other sessions for this user
    if (this.userId) {
      await SessionsCollection.updateAsync(
        { userId: this.userId, isActive: true },
        { $set: { isActive: false } },
        { multi: true }
      );
    }
    
    const sessionId = await SessionsCollection.insertAsync(session);
    console.log(`✅ Created new session: ${sessionId}`);
    
    return sessionId;
  },
  
  async 'sessions.list'(limit = 20, offset = 0) {
    check(limit, Match.Integer);
    check(offset, Match.Integer);
    
    const userId = this.userId || null;
    
    const sessions = await SessionsCollection.find(
      { userId },
      { 
        sort: { updatedAt: -1 }, 
        limit,
        skip: offset
      }
    ).fetchAsync();
    
    const total = await SessionsCollection.countDocuments({ userId });
    
    return {
      sessions,
      total,
      hasMore: offset + limit < total
    };
  },
  
  async 'sessions.get'(sessionId: string) {
    check(sessionId, String);
    
    const session = await SessionsCollection.findOneAsync({
      _id: sessionId,
      userId: this.userId || null
    });
    
    if (!session) {
      throw new Meteor.Error('session-not-found', 'Session not found');
    }
    
    return session;
  },
  
  async 'sessions.update'(sessionId: string, updates: Partial<ChatSession>) {
    check(sessionId, String);
    check(updates, Object);
    
    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.userId;
    delete updates.createdAt;
    
    const result = await SessionsCollection.updateAsync(
      { 
        _id: sessionId,
        userId: this.userId || null
      },
      { 
        $set: { 
          ...updates, 
          updatedAt: new Date() 
        } 
      }
    );
    
    return result;
  },
  
  async 'sessions.delete'(sessionId: string) {
    check(sessionId, String);
    
    // Verify ownership
    const session = await SessionsCollection.findOneAsync({
      _id: sessionId,
      userId: this.userId || null
    });
    
    if (!session) {
      throw new Meteor.Error('session-not-found', 'Session not found');
    }
    
    // Delete all associated messages
    const deletedMessages = await MessagesCollection.removeAsync({ sessionId });
    console.log(`🗑️ Deleted ${deletedMessages} messages from session ${sessionId}`);
    
    // Delete the session
    const result = await SessionsCollection.removeAsync(sessionId);
    console.log(`🗑️ Deleted session ${sessionId}`);
    
    return { session: result, messages: deletedMessages };
  },
  
  async 'sessions.setActive'(sessionId: string) {
    check(sessionId, String);
    
    const userId = this.userId || null;
    
    // Deactivate all other sessions
    await SessionsCollection.updateAsync(
      { userId, isActive: true },
      { $set: { isActive: false } },
      { multi: true }
    );
    
    // Activate this session
    const result = await SessionsCollection.updateAsync(
      { _id: sessionId, userId },
      { 
        $set: { 
          isActive: true,
          updatedAt: new Date()
        } 
      }
    );
    
    return result;
  },
  
  async 'sessions.generateTitle'(sessionId: string) {
    check(sessionId, String);
    
    // Get first few messages
    const messages = await MessagesCollection.find(
      { sessionId, role: 'user' },
      { limit: 3, sort: { timestamp: 1 } }
    ).fetchAsync();
    
    if (messages.length > 0) {
      // Use first user message as basis for title
      const firstUserMessage = messages[0];
      if (firstUserMessage) {
        // Clean up the message for a better title
        let title = firstUserMessage.content
          .replace(/^(search for|find|look for|show me)\s+/i, '') // Remove common prefixes
          .replace(/[?!.]$/, '') // Remove ending punctuation
          .trim();
        
        // Limit length
        if (title.length > 50) {
          title = title.substring(0, 50).trim() + '...';
        }
        
        // Capitalize first letter
        title = title.charAt(0).toUpperCase() + title.slice(1);
        
        await SessionsCollection.updateAsync(sessionId, {
          $set: { 
            title,
            updatedAt: new Date()
          }
        });
        
        return title;
      }
    }
    
    return null;
  },
  
  async 'sessions.updateMetadata'(sessionId: string, metadata: any) {
    check(sessionId, String);
    check(metadata, Object);
    
    const result = await SessionsCollection.updateAsync(
      { 
        _id: sessionId,
        userId: this.userId || null
      },
      { 
        $set: { 
          metadata,
          updatedAt: new Date()
        } 
      }
    );
    
    return result;
  },
  
  async 'sessions.export'(sessionId: string) {
    check(sessionId, String);
    
    const session = await SessionsCollection.findOneAsync({
      _id: sessionId,
      userId: this.userId || null
    });
    
    if (!session) {
      throw new Meteor.Error('session-not-found', 'Session not found');
    }
    
    const messages = await MessagesCollection.find(
      { sessionId },
      { sort: { timestamp: 1 } }
    ).fetchAsync();
    
    return {
      session,
      messages,
      exportedAt: new Date(),
      version: '1.0'
    };
  },
  
  async 'sessions.import'(data: any) {
    check(data, {
      session: Object,
      messages: Array,
      version: String
    });
    
    // Create new session based on imported data
    const newSession: Omit<ChatSession, '_id'> = {
      ...data.session,
      title: `[Imported] ${data.session.title}`,
      userId: this.userId || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };
    
    delete (newSession as any)._id;
    
    const sessionId = await SessionsCollection.insertAsync(newSession);
    
    // Import messages with new sessionId
    for (const message of data.messages) {
      const newMessage = {
        ...message,
        sessionId,
        timestamp: new Date(message.timestamp)
      };
      delete newMessage._id;
      
      await MessagesCollection.insertAsync(newMessage);
    }
    
    return sessionId;
  }
});