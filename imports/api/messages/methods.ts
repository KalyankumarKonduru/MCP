import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';

Meteor.methods({
  'messages.insert'(messageData: Omit<Message, '_id'>) {
    check(messageData, {
      content: String,
      role: String,
      timestamp: Date,
      sessionId: String
    });

    return MessagesCollection.insert(messageData);
  },

  async 'mcp.processQuery'(query: string) {
    check(query, String);
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return 'MCP Client is not ready. Please check your API configuration.';
      }
      
      try {
        return await mcpManager.processQuery(query);
      } catch (error) {
        console.error('MCP processing error:', error);
        return 'I encountered an error while processing your request. Please try again.';
      }
    }
    
    return 'Simulation mode - no actual processing';
  }
});