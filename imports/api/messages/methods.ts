import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';

Meteor.methods({
  async 'messages.insert'(messageData: Omit<Message, '_id'>) {
    check(messageData, {
      content: String,
      role: String,
      timestamp: Date,
      sessionId: String
    });

    return await MessagesCollection.insertAsync(messageData);
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
  },

  async 'mcp.switchProvider'(provider: 'anthropic' | 'ozwell') {
    check(provider, String);
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
      }
      
      try {
        await mcpManager.switchProvider(provider);
        return `Switched to ${provider.toUpperCase()} provider`;
      } catch (error) {
        console.error('Provider switch error:', error);
        throw new Meteor.Error('switch-failed', 'Failed to switch provider');
      }
    }
    
    return 'Provider switched (simulation mode)';
  },

  'mcp.getCurrentProvider'() {
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return null;
      }
      
      return mcpManager.getCurrentProvider();
    }
    
    return 'anthropic';
  },

  'mcp.getAvailableProviders'() {
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    
    const providers = [];
    if (anthropicKey) providers.push('anthropic');
    if (ozwellKey) providers.push('ozwell');
    
    return providers;
  }
});