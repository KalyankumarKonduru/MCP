import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { SessionsCollection } from './sessions';

// Publish user's sessions list
Meteor.publish('sessions.list', function(limit = 20) {
  check(limit, Number);
  
  const userId = this.userId || null;
  
  return SessionsCollection.find(
    { userId },
    { 
      sort: { updatedAt: -1 }, 
      limit,
      fields: { 
        title: 1, 
        updatedAt: 1, 
        messageCount: 1, 
        lastMessage: 1,
        isActive: 1,
        createdAt: 1,
        'metadata.patientId': 1,
        'metadata.documentIds': 1
      }
    }
  );
});

// Publish single session details
Meteor.publish('session.details', function(sessionId: string) {
  check(sessionId, String);
  
  return SessionsCollection.find({ 
    _id: sessionId,
    userId: this.userId || null
  });
});

// Publish active session
Meteor.publish('session.active', function() {
  const userId = this.userId || null;
  
  return SessionsCollection.find({ 
    userId,
    isActive: true
  }, {
    limit: 1
  });
});

// Publish recent sessions with message preview
Meteor.publish('sessions.recent', function(limit = 5) {
  check(limit, Number);
  
  const userId = this.userId || null;
  
  return SessionsCollection.find(
    { userId },
    { 
      sort: { updatedAt: -1 }, 
      limit,
      fields: {
        title: 1,
        lastMessage: 1,
        messageCount: 1,
        updatedAt: 1,
        isActive: 1
      }
    }
  );
});