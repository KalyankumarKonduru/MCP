import { Meteor } from 'meteor/meteor';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import '/imports/api/messages/methods';
import '/imports/api/messages/publications';

Meteor.startup(async () => {
  console.log('Starting MCP Pilot server...');
  
  // Initialize MCP Client
  const mcpManager = MCPClientManager.getInstance();
  
  try {
    // Try to get API keys from multiple sources
    const settings = Meteor.settings?.private;
    
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    const ozwellEndpoint = settings?.OZWELL_ENDPOINT || process.env.OZWELL_ENDPOINT || 'https://ai.bluehive.com/api/v1/completion';
    
    console.log('Anthropic key found:', !!anthropicKey);
    console.log('Ozwell key found:', !!ozwellKey);
    console.log('Ozwell endpoint:', ozwellEndpoint);
    
    if (!anthropicKey && !ozwellKey) {
      console.warn('⚠️  No API key found. Please set ANTHROPIC_API_KEY or OZWELL_API_KEY in your settings.json or environment variables.');
      console.warn('   The chat interface will work but AI responses will show error messages.');
      return;
    }

    // Determine default provider (prefer Anthropic, fallback to Ozwell)
    const provider = anthropicKey ? 'anthropic' : 'ozwell';
    const apiKey = anthropicKey || ozwellKey;

    if (!apiKey) {
      console.warn('⚠️  API key is empty or undefined');
      return;
    }

    await mcpManager.initialize({
      provider: provider as 'anthropic' | 'ozwell',
      apiKey: apiKey,
      ozwellEndpoint: ozwellEndpoint,
    });
    
    console.log('✅ Server started successfully with MCP integration');
    console.log(`🤖 Using ${provider.toUpperCase()} as the default AI provider`);
    
    if (anthropicKey && ozwellKey) {
      console.log('🔄 Both providers available - you can switch between them in the chat');
    }
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