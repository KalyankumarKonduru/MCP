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

    // Initialize main MCP client for LLM
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

    // Connect to medical MCP server via Streamable HTTP
    const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                        process.env.MEDICAL_MCP_SERVER_URL || 
                        'http://localhost:3001';
    
    if (!mcpServerUrl || mcpServerUrl === 'DISABLED') {
      console.warn('⚠️  Medical MCP Server URL not configured or disabled.');
      console.warn('   Add MEDICAL_MCP_SERVER_URL to your settings.json to enable medical document features.');
      console.warn('   Example: "MEDICAL_MCP_SERVER_URL": "http://localhost:3001"');
    } else {
      try {
        console.log(`📄 Attempting to connect to Medical MCP Server at: ${mcpServerUrl}`);
        await mcpManager.connectToMedicalServer();
        console.log('✅ Connected to Medical Document MCP Server via Streamable HTTP');
        console.log('🏥 Medical document processing features are now available');
      } catch (error) {
        console.warn('⚠️  Medical MCP Server connection failed:', error);
        console.warn('   Document processing features will be disabled.');
        console.warn('   Make sure to:');
        console.warn('   1. Start the MCP server in HTTP mode: npm run start:http');
        console.warn('   2. Update MEDICAL_MCP_SERVER_URL in settings.json');
        console.warn('   3. Verify the MCP server is accessible at the configured URL');
        console.warn('   4. Check that MongoDB and OpenAI credentials are configured in the MCP server');
      }
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