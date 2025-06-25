import { Meteor } from 'meteor/meteor';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import '/imports/api/messages/methods';
import '/imports/api/messages/publications';

Meteor.startup(async () => {
  console.log('Starting MCP Pilot server...');
  
  // Initialize MCP Client
  const mcpManager = MCPClientManager.getInstance();
  
  try {
    // Try to get API keys from Meteor settings first, then environment
    const settings = Meteor.settings?.private;
    const apiKey = settings?.OPENAI_API_KEY || 
                   settings?.ANTHROPIC_API_KEY || 
                   process.env.OPENAI_API_KEY || 
                   process.env.ANTHROPIC_API_KEY;
    
    const provider = (settings?.OPENAI_API_KEY || process.env.OPENAI_API_KEY) ? 'openai' : 'anthropic';
    
    if (!apiKey) {
      console.warn('⚠️  No API key found. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY in your settings.json or environment variables.');
      console.warn('   The chat interface will work but AI responses will show error messages.');
      return;
    }

    await mcpManager.initialize({
      provider: provider as 'openai' | 'anthropic',
      apiKey: apiKey,
    });
    
    console.log('✅ Server started successfully with MCP integration');
    console.log(`🤖 Using ${provider.toUpperCase()} as the AI provider`);
  } catch (error) {
    console.error('❌ Failed to initialize MCP client:', error);
    console.warn('⚠️  Server will run without AI capabilities');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  const mcpManager = MCPClientManager.getInstance();
  mcpManager.shutdown().then(() => {
    process.exit(0);
  });
});