// server/main.ts
import { Meteor } from 'meteor/meteor';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import '/imports/api/messages/methods';
import '/imports/api/messages/publications';
import '/imports/api/sessions/methods';
import '/imports/api/sessions/publications';
import './startup-sessions';

Meteor.startup(async () => {
  console.log(' Starting MCP Pilot server with Intelligent Tool Selection...');
  
  const mcpManager = MCPClientManager.getInstance();
  
  try {
    // Get API keys
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    const ozwellEndpoint = settings?.OZWELL_ENDPOINT || process.env.OZWELL_ENDPOINT;
    
    console.log(' API Key Status:');
    console.log('  Anthropic key found:', !!anthropicKey, anthropicKey?.substring(0, 15) + '...');
    console.log('  Ozwell key found:', !!ozwellKey, ozwellKey?.substring(0, 15) + '...');
    console.log('  Ozwell endpoint:', ozwellEndpoint);
    
    if (!anthropicKey && !ozwellKey) {
      console.warn('  No API key found for intelligent tool selection.');
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
      console.warn('  No valid API keys found');
      return;
    }

    // Initialize main MCP client with intelligent tool selection
    await mcpManager.initialize({
      provider,
      apiKey,
      ozwellEndpoint,
    });
    
    console.log(' MCP Client initialized with intelligent tool selection');
    console.log(` MCP Using ${provider.toUpperCase()} as the AI provider for intelligent tool selection`);
    console.log(' MCP Session management enabled with Atlas MongoDB');
    
    // Show provider capabilities
    if (anthropicKey && ozwellKey) {
      console.log(' MCP Both providers available - you can switch between them in the chat');
      console.log('   MCP Anthropic: Advanced tool calling with Claude models (recommended)');
      console.log('   MCP Ozwell: Bluehive AI models with intelligent prompting');
    } else if (anthropicKey) {
      console.log(' MCP Anthropic provider with native tool calling support');
    } else {
      console.log(` MCP Only ${provider.toUpperCase()} provider available`);
    }

    // Connect to medical MCP server for document tools
    const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                        process.env.MEDICAL_MCP_SERVER_URL || 
                        'http://localhost:3005';
    
    if (mcpServerUrl && mcpServerUrl !== 'DISABLED') {
      try {
        console.log(` Connecting to Medical MCP Server for intelligent tool discovery...`);
        await mcpManager.connectToMedicalServer();
        console.log(' Medical document tools discovered and ready for intelligent selection');
      } catch (error) {
        console.warn('  Medical MCP Server connection failed:', error);
        console.warn('   Document processing tools will be unavailable for intelligent selection.');
      }
    } else {
      console.warn('  Medical MCP Server URL not configured.');
    }

    // Connect to Aidbox MCP server for FHIR tools
    const aidboxServerUrl = settings?.AIDBOX_MCP_SERVER_URL || 
                           process.env.AIDBOX_MCP_SERVER_URL || 
                           'http://localhost:3002';
    
    if (aidboxServerUrl && aidboxServerUrl !== 'DISABLED') {
      try {
        console.log(` Connecting to Aidbox MCP Server for intelligent FHIR tool discovery...`);
        await mcpManager.connectToAidboxServer();
        console.log(' Aidbox FHIR tools discovered and ready for intelligent selection');
      } catch (error) {
        console.warn('  Aidbox MCP Server connection failed:', error);  
        console.warn('   Aidbox FHIR features will be unavailable for intelligent selection.');
      }
    } else {
      console.warn('  Aidbox MCP Server URL not configured.');
    }

    // Connect to Epic MCP server for Epic EHR tools
    const epicServerUrl = settings?.EPIC_MCP_SERVER_URL || 
                         process.env.EPIC_MCP_SERVER_URL || 
                         'http://localhost:3003';
    
    if (epicServerUrl && epicServerUrl !== 'DISABLED') {
      try {
        console.log(` Connecting to Epic MCP Server for intelligent EHR tool discovery...`);
        await mcpManager.connectToEpicServer();
        console.log(' Epic EHR tools discovered and ready for intelligent selection');
      } catch (error) {
        console.warn('  Epic MCP Server connection failed:', error);
        console.warn('   Epic EHR features will be unavailable for intelligent selection.');
      }
    } else {
      console.warn('  Epic MCP Server URL not configured.');
    }
    
    // Log final status
    const availableTools = mcpManager.getAvailableTools();
    console.log(`\n Intelligent Tool Selection Status:`);
    console.log(`   Total tools available: ${availableTools.length}`);
    console.log(`    AI Provider: ${provider.toUpperCase()}`);
    console.log(`   Tool selection method: ${provider === 'anthropic' ? 'Native Claude tool calling' : 'Intelligent prompting'}`);
    
    // Log available tool categories
    if (availableTools.length > 0) {
      const toolCategories = categorizeTools(availableTools);
      console.log('\n🔧 Available Tool Categories:');
      // Object.entries(toolCategories).forEach(([category, count]) => {
      // console.log(`   ${getCategoryEmoji(category)} ${category}: ${count} tools`);
      // });
    }
  
    if (availableTools.length > 0) {
      console.log('\n SUCCESS: Claude will now intelligently select tools based on user queries!');
      console.log('   • No more hardcoded patterns or keyword matching');
      console.log('   • Claude analyzes each query and chooses appropriate tools');
      console.log('   • Supports complex multi-step tool usage');
      console.log('   • Automatic tool chaining and result interpretation');
    } else {
      console.log('\n  No tools available - running in basic LLM mode');
    }
    
    console.log('\n Example queries that will work with intelligent tool selection:');
    console.log('    Aidbox FHIR: "Get me details about all Hank Preston available from Aidbox"');
    console.log('    Epic EHR: "Search for patient Camila Lopez in Epic"');
    console.log('    Epic EHR: "Get lab results for patient erXuFYUfucBZaryVksYEcMg3"');
    console.log('    Documents: "Upload this lab report and find similar cases"');
    console.log('   Multi-tool: "Search Epic for diabetes patients and get their medications"');
    
  } catch (error) {
    console.error('Failed to initialize intelligent tool selection:', error);
    console.warn('Server will run with limited capabilities');
    console.warn('Basic LLM responses will work, but no tool calling');
  }
});

// Helper function to categorize tools for better logging
// Fix for server/main.ts - Replace the categorizeTools function

function categorizeTools(tools: any[]): Record<string, number> {
  const categories: Record<string, number> = {};
  
  tools.forEach(tool => {
    let category = 'Other';
    
    // Epic EHR tools - tools with 'epic' prefix
    if (tool.name.toLowerCase().startsWith('epic')) {
      category = 'Epic EHR';
    }
    // Aidbox FHIR tools - standard FHIR operations without 'epic' prefix from Aidbox
    else if (isAidboxFHIRTool(tool)) {
      category = 'Aidbox FHIR';
    }
    // Medical Document tools - document processing operations
    else if (isDocumentTool(tool)) {
      category = 'Medical Documents';
    }
    // Search & Analysis tools - AI/ML operations
    else if (isSearchAnalysisTool(tool)) {
      category = 'Search & Analysis';
    }
    
    categories[category] = (categories[category] || 0) + 1;
  });
  
  return categories;
}

function isAidboxFHIRTool(tool: any): boolean {
  const aidboxFHIRToolNames = [
    'searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient',
    'getPatientObservations', 'createObservation',
    'getPatientMedications', 'createMedicationRequest',
    'getPatientConditions', 'createCondition',
    'getPatientEncounters', 'createEncounter'
  ];
  
  // Must be in the Aidbox tool list AND not start with 'epic'
  return aidboxFHIRToolNames.includes(tool.name) && 
         !tool.name.toLowerCase().startsWith('epic');
}

function isDocumentTool(tool: any): boolean {
  const documentToolNames = [
    'uploadDocument', 'searchDocuments', 'listDocuments',
    'chunkAndEmbedDocument', 'generateEmbeddingLocal'
  ];
  
  return documentToolNames.includes(tool.name);
}

function isSearchAnalysisTool(tool: any): boolean {
  const analysisToolNames = [
    'analyzePatientHistory', 'findSimilarCases', 'getMedicalInsights',
    'extractMedicalEntities', 'semanticSearchLocal'
  ];
  
  return analysisToolNames.includes(tool.name);
}

// Helper function to get emoji for tool categories
// function getCategoryEmoji(category: string): string {
//   const emojiMap: Record<string, string> = {
//     'Epic EHR': '🏥',
//     'Aidbox FHIR': '📋',
//     'Medical Documents': '📄',
//     'Search & Analysis': '🔍',
//     'Other': '🔧'
//   };
  
//   return emojiMap[category] || '🔧';
// }

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n Shutting down server...');
  const mcpManager = MCPClientManager.getInstance();
  
  // Clear all context before shutdown
  const { ContextManager } = require('/imports/api/context/contextManager');
  ContextManager.clearAllContexts();
  
  mcpManager.shutdown().then(() => {
    console.log(' Server shutdown complete');
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