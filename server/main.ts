// server/main.ts
import { Meteor } from 'meteor/meteor';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import '/imports/api/messages/methods';
import '/imports/api/messages/publications';
import '/imports/api/sessions/methods';
import '/imports/api/sessions/publications';
import './startup-sessions';

Meteor.startup(async () => {
  console.log('🚀 Starting MCP Pilot server with Intelligent Tool Selection...');
  
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
      console.warn('⚠️  No API key found for intelligent tool selection.');
      return;
    }

    // Determine default provider (prefer Anthropic for better tool calling, fallback to Ozwell)
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

    // Initialize main MCP client with intelligent tool selection
    await mcpManager.initialize({
      provider,
      apiKey,
      ozwellEndpoint,
    });
    
    console.log('✅ MCP Client initialized with intelligent tool selection');
    console.log(`🧠 Using ${provider.toUpperCase()} as the AI provider for intelligent tool selection`);
    console.log('💾 Session management enabled with Atlas MongoDB');
    
    // Show provider capabilities
    if (anthropicKey && ozwellKey) {
      console.log('🔄 Both providers available - you can switch between them in the chat');
      console.log('   Anthropic: Advanced tool calling with Claude models (recommended)');
      console.log('   Ozwell: Bluehive AI models with intelligent prompting');
    } else if (anthropicKey) {
      console.log('🤖 Anthropic provider with native tool calling support');
    } else {
      console.log(`🔒 Only ${provider.toUpperCase()} provider available`);
    }

    // Connect to medical MCP server for document tools
    const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                        process.env.MEDICAL_MCP_SERVER_URL || 
                        'http://localhost:3001';
    
    if (mcpServerUrl && mcpServerUrl !== 'DISABLED') {
      try {
        console.log(`🏥 Connecting to Medical MCP Server for intelligent tool discovery...`);
        await mcpManager.connectToMedicalServer();
        console.log('✅ Medical document tools discovered and ready for intelligent selection');
      } catch (error) {
        console.warn('⚠️  Medical MCP Server connection failed:', error);
        console.warn('   Document processing tools will be unavailable for intelligent selection.');
      }
    } else {
      console.warn('⚠️  Medical MCP Server URL not configured.');
    }

    // Connect to Aidbox MCP server for FHIR tools
    const aidboxServerUrl = settings?.AIDBOX_MCP_SERVER_URL || 
                           process.env.AIDBOX_MCP_SERVER_URL || 
                           'http://localhost:3002';
    
    if (aidboxServerUrl && aidboxServerUrl !== 'DISABLED') {
      try {
        console.log(`🏥 Connecting to Aidbox MCP Server for intelligent FHIR tool discovery...`);
        await mcpManager.connectToAidboxServer();
        console.log('✅ Aidbox FHIR tools discovered and ready for intelligent selection');
      } catch (error) {
        console.warn('⚠️  Aidbox MCP Server connection failed:', error);
        console.warn('   Aidbox FHIR features will be unavailable for intelligent selection.');
      }
    } else {
      console.warn('⚠️  Aidbox MCP Server URL not configured.');
    }
    
    // Log final status
    const availableTools = mcpManager.getAvailableTools();
    console.log(`\n🎯 Intelligent Tool Selection Status:`);
    console.log(`   📊 Total tools available: ${availableTools.length}`);
    console.log(`   🧠 AI Provider: ${provider.toUpperCase()}`);
    console.log(`   🔧 Tool selection method: ${provider === 'anthropic' ? 'Native Claude tool calling' : 'Intelligent prompting'}`);
    
    if (availableTools.length > 0) {
      console.log('\n🏆 SUCCESS: Claude will now intelligently select tools based on user queries!');
      console.log('   • No more hardcoded patterns or keyword matching');
      console.log('   • Claude analyzes each query and chooses appropriate tools');
      console.log('   • Supports complex multi-step tool usage');
      console.log('   • Automatic tool chaining and result interpretation');
    } else {
      console.log('\n⚠️  No tools available - running in basic LLM mode');
    }
    
    console.log('\n💡 Example queries that will work with intelligent tool selection:');
    console.log('   • "Get me details about all Hank Preston available from Aidbox"');
    console.log('   • "Search for diabetes documents and show patient medications"'); 
    console.log('   • "Upload this lab report and find similar cases"');
    console.log('   • "What conditions does patient erXuFYUfucBZaryVksYEcMg3 have?"');
    
  } catch (error) {
    console.error('❌ Failed to initialize intelligent tool selection:', error);
    console.warn('⚠️  Server will run with limited capabilities');
    console.warn('   Basic LLM responses will work, but no tool calling');
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