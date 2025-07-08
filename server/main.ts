import { Meteor } from 'meteor/meteor';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import '/imports/api/messages/methods';
import '/imports/api/messages/publications';
import '/imports/api/sessions/methods';
import '/imports/api/sessions/publications';
import './startup-sessions';

Meteor.startup(async () => {
  console.log('🚀 Starting MCP Pilot server with Dynamic Tool Selection...');
  
  const mcpManager = MCPClientManager.getInstance();
  
  try {
    // Get API keys
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    const ozwellEndpoint = settings?.OZWELL_ENDPOINT || process.env.OZWELL_ENDPOINT;
    
    console.log('🔑 API Key Status:');
    console.log('  Anthropic key found:', !!anthropicKey, anthropicKey?.substring(0, 15) + '...');
    console.log('  Ozwell key found:', !!ozwellKey, ozwellKey?.substring(0, 15) + '...');
    console.log('  Ozwell endpoint:', ozwellEndpoint);
    
    if (!anthropicKey && !ozwellKey) {
      console.warn('⚠️  No API key found for dynamic tool selection.');
      return;
    }

    // Determine default provider (prefer Anthropic, fallback to Ozwell)
    let provider: 'anthropic' | 'ozwell';
    let apiKey: string;

    if (anthropicKey) {
      provider = 'anthropic';
      apiKey = anthropicKey;
    } else if (ozwellKey) {
      provider = 'ozwell';
      apiKey = ozwellKey;
    } else {
      console.warn('⚠️  No valid API keys found');
      return;
    }

    // Initialize main MCP client with the default provider
    await mcpManager.initialize({
      provider,
      apiKey,
      ozwellEndpoint,
    });
    
    console.log('✅ MCP Client initialized with dynamic tool selection');
    console.log(`🤖 Using ${provider.toUpperCase()} as the default AI provider`);
    console.log('💾 Session management enabled with Atlas MongoDB');
    
    // Show provider switching availability
    if (anthropicKey && ozwellKey) {
      console.log('🔄 Both providers available - you can switch between them in the chat');
      console.log('   Anthropic: Claude models');
      console.log('   Ozwell: Bluehive AI models');
    } else {
      console.log(`🔒 Only ${provider.toUpperCase()} provider available`);
    }

    // Connect to medical MCP server
    const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                        process.env.MEDICAL_MCP_SERVER_URL || 
                        'http://localhost:3001';
    
    if (mcpServerUrl && mcpServerUrl !== 'DISABLED') {
      try {
        console.log(`🏥 Connecting to Medical MCP Server for tool discovery...`);
        await mcpManager.connectToMedicalServer();
        console.log('✅ All medical tools discovered and ready for dynamic selection');
      } catch (error) {
        console.warn('⚠️  Medical MCP Server connection failed:', error);
        console.warn('   Some tools will be unavailable for dynamic selection.');
      }
    } else {
      console.warn('⚠️  Medical MCP Server URL not configured.');
    }
    
    console.log('🎯 Dynamic Tool Selection ready! Claude will intelligently choose tools based on user queries.');
    
  } catch (error) {
    console.error('❌ Failed to initialize dynamic tool selection:', error);
    console.warn('⚠️  Server will run with limited capabilities');
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  const mcpManager = MCPClientManager.getInstance();
  
  // Clear all context before shutdown
  const { ContextManager } = require('/imports/api/context/contextManager');
  ContextManager.clearAllContexts();
  
  mcpManager.shutdown().then(() => {
    console.log('👋 Server shutdown complete');
    process.exit(0);
  }).catch((error) => {
    console.error('Error during shutdown:', error);
    process.exit(1);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});