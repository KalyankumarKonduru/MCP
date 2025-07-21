import { Meteor } from 'meteor/meteor';
import { SessionsCollection } from '/imports/api/sessions/sessions';
import { MessagesCollection } from '/imports/api/messages/messages';

Meteor.startup(async () => {
  console.log(' Setting up session management...');
  
  // Create indexes for better performance
  try {
    // Sessions indexes
    await SessionsCollection.createIndexAsync({ userId: 1, updatedAt: -1 });
    await SessionsCollection.createIndexAsync({ isActive: 1 });
    await SessionsCollection.createIndexAsync({ createdAt: -1 });
    await SessionsCollection.createIndexAsync({ 'metadata.patientId': 1 });
    
    // Messages indexes
    await MessagesCollection.createIndexAsync({ sessionId: 1, timestamp: 1 });
    await MessagesCollection.createIndexAsync({ sessionId: 1, role: 1 });
    
    console.log(' Database indexes created successfully');
  } catch (error) {
    console.error(' Error creating indexes:', error);
  }
  
  // Cleanup old sessions (optional - remove sessions older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  try {
    const oldSessions = await SessionsCollection.find({
      updatedAt: { $lt: thirtyDaysAgo }
    }).fetchAsync();
    
    if (oldSessions.length > 0) {
      console.log(`🧹 Found ${oldSessions.length} old sessions to clean up`);
      
      for (const session of oldSessions) {
        await MessagesCollection.removeAsync({ sessionId: session._id });
        await SessionsCollection.removeAsync(session._id);
      }
      
      console.log(' Old sessions cleaned up');
    }
  } catch (error) {
    console.error(' Error cleaning up old sessions:', error);
  }
  
  // Log session statistics
  try {
    const totalSessions = await SessionsCollection.countDocuments();
    const totalMessages = await MessagesCollection.countDocuments();
    const activeSessions = await SessionsCollection.countDocuments({ isActive: true });
    
    console.log(' Session Statistics:');
    console.log(`   Total sessions: ${totalSessions}`);
    console.log(`   Active sessions: ${activeSessions}`);
    console.log(`   Total messages: ${totalMessages}`);
  } catch (error) {
    console.error(' Error getting session statistics:', error);
  }
});