// imports/api/mcp/mcpClientManager.ts
import Anthropic from '@anthropic-ai/sdk';
import { MedicalServerConnection, MedicalDocumentOperations, createMedicalOperations } from './medicalServerConnection';
import { AidboxServerConnection, AidboxFHIROperations, createAidboxOperations } from './aidboxServerConnection';
import { EpicServerConnection, EpicFHIROperations, createEpicOperations } from './epicServerConnection';

export interface MCPClientConfig {
  provider: 'anthropic' | 'ozwell';
  apiKey: string;
  ozwellEndpoint?: string;
}

export class MCPClientManager {
  private static instance: MCPClientManager;
  private anthropic?: Anthropic;
  private isInitialized = false;
  private config?: MCPClientConfig;
  
  // Medical MCP connection (Streamable HTTP)
  private medicalConnection?: MedicalServerConnection;
  private medicalOperations?: MedicalDocumentOperations;
  private availableTools: any[] = [];

  // Aidbox MCP connection
  private aidboxConnection?: AidboxServerConnection;
  private aidboxOperations?: AidboxFHIROperations;
  private aidboxTools: any[] = [];

  // Epic MCP connection
  private epicConnection?: EpicServerConnection;
  private epicOperations?: EpicFHIROperations;
  private epicTools: any[] = [];

  private constructor() {}

  public static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  public async initialize(config: MCPClientConfig): Promise<void> {
    console.log('🤖 Initializing MCP Client with Intelligent Tool Selection');
    this.config = config;

    try {
      if (config.provider === 'anthropic') {
        console.log('Creating Anthropic client with native tool calling support...');
        this.anthropic = new Anthropic({
          apiKey: config.apiKey,
        });
        console.log('✅ Anthropic client initialized with intelligent tool selection');
      }

      this.isInitialized = true;
      console.log(`✅ MCP Client ready with provider: ${config.provider}`);
    } catch (error) {
      console.error('❌ Failed to initialize MCP client:', error);
      throw error;
    }
  }

  // Connect to medical MCP server and get all available tools
  public async connectToMedicalServer(): Promise<void> {
    try {
      const settings = (global as any).Meteor?.settings?.private;
      const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                           process.env.MEDICAL_MCP_SERVER_URL || 
                           'http://localhost:3001';
      
      console.log(`🏥 Connecting to Medical MCP Server at: ${mcpServerUrl}`);
      
      this.medicalConnection = new MedicalServerConnection(mcpServerUrl);
      await this.medicalConnection.connect();
      this.medicalOperations = createMedicalOperations(this.medicalConnection);
      
      // Get all available tools
      const toolsResult = await this.medicalConnection.listTools();
      this.availableTools = toolsResult.tools || [];
      
      console.log(`✅ Connected with ${this.availableTools.length} medical tools available`);
      console.log(`📋 Medical tool names: ${this.availableTools.map(t => t.name).join(', ')}`);
      
    } catch (error) {
      console.error('❌ Medical MCP Server HTTP connection failed:', error);
      throw error;
    }
  }

  public async connectToAidboxServer(): Promise<void> {
    try {
      const settings = (global as any).Meteor?.settings?.private;
      const aidboxServerUrl = settings?.AIDBOX_MCP_SERVER_URL || 
                             process.env.AIDBOX_MCP_SERVER_URL || 
                             'http://localhost:3002';
      
      console.log(`🏥 Connecting to Aidbox MCP Server at: ${aidboxServerUrl}`);
      
      this.aidboxConnection = new AidboxServerConnection(aidboxServerUrl);
      await this.aidboxConnection.connect();
      this.aidboxOperations = createAidboxOperations(this.aidboxConnection);
      
      // Get Aidbox tools
      const toolsResult = await this.aidboxConnection.listTools();
      this.aidboxTools = toolsResult.tools || [];
      
      console.log(`✅ Connected to Aidbox with ${this.aidboxTools.length} tools available`);
      console.log(`📋 Aidbox tool names: ${this.aidboxTools.map(t => t.name).join(', ')}`);
      
      // Merge with existing tools, ensuring unique names
      this.availableTools = this.mergeToolsUnique(this.availableTools, this.aidboxTools);
      
      this.logAvailableTools();
      
    } catch (error) {
      console.error('❌ Aidbox MCP Server connection failed:', error);
      throw error;
    }
  }

  public async connectToEpicServer(): Promise<void> {
    try {
      const settings = (global as any).Meteor?.settings?.private;
      const epicServerUrl = settings?.EPIC_MCP_SERVER_URL || 
                           process.env.EPIC_MCP_SERVER_URL || 
                           'http://localhost:3003';
      
      console.log(`🏥 Connecting to Epic MCP Server at: ${epicServerUrl}`);
      
      this.epicConnection = new EpicServerConnection(epicServerUrl);
      await this.epicConnection.connect();
      this.epicOperations = createEpicOperations(this.epicConnection);
      
      // Get Epic tools
      const toolsResult = await this.epicConnection.listTools();
      this.epicTools = toolsResult.tools || [];
      
      console.log(`✅ Connected to Epic with ${this.epicTools.length} tools available`);
      console.log(`📋 Epic tool names: ${this.epicTools.map(t => t.name).join(', ')}`);
      
      // Merge with existing tools, ensuring unique names
      this.availableTools = this.mergeToolsUnique(this.availableTools, this.epicTools);
      
      this.logAvailableTools();
      
    } catch (error) {
      console.error('❌ Epic MCP Server connection failed:', error);
      throw error;
    }
  }

  // Merge tools ensuring unique names
  private mergeToolsUnique(existingTools: any[], newTools: any[]): any[] {
    console.log(`🔧 Merging tools: ${existingTools.length} existing + ${newTools.length} new`);
    
    const toolNameSet = new Set(existingTools.map(tool => tool.name));
    const uniqueNewTools = newTools.filter(tool => {
      if (toolNameSet.has(tool.name)) {
        console.warn(`⚠️ Duplicate tool name found: ${tool.name} - skipping duplicate`);
        return false;
      }
      toolNameSet.add(tool.name);
      return true;
    });
    
    const mergedTools = [...existingTools, ...uniqueNewTools];
    console.log(`🔧 Merged tools: ${existingTools.length} existing + ${uniqueNewTools.length} new = ${mergedTools.length} total`);
    
    return mergedTools;
  }

// Fix for imports/api/mcp/mcpClientManager.ts - Replace the logAvailableTools method

private logAvailableTools(): void {
  console.log('\n🔧 Available Tools for Intelligent Selection:');
  
  // Separate tools by actual source/type, not by pattern matching
  const epicTools = this.availableTools.filter(t => 
    t.name.toLowerCase().startsWith('epic')
  );
  
  const aidboxTools = this.availableTools.filter(t => 
    this.isAidboxFHIRTool(t) && !t.name.toLowerCase().startsWith('epic')
  );
  
  const documentTools = this.availableTools.filter(t => 
    this.isDocumentTool(t)
  );
  
  const analysisTools = this.availableTools.filter(t => 
    this.isAnalysisTool(t)
  );
  
  const otherTools = this.availableTools.filter(t => 
    !epicTools.includes(t) && 
    !aidboxTools.includes(t) && 
    !documentTools.includes(t) && 
    !analysisTools.includes(t)
  );
  
  if (aidboxTools.length > 0) {
    console.log('🏥 Aidbox FHIR Tools:');
    aidboxTools.forEach(tool => console.log(`   • ${tool.name} - ${tool.description?.substring(0, 60)}...`));
  }
  
  if (epicTools.length > 0) {
    console.log('🏥 Epic EHR Tools:');
    epicTools.forEach(tool => console.log(`   • ${tool.name} - ${tool.description?.substring(0, 60)}...`));
  }
  
  if (documentTools.length > 0) {
    console.log('📄 Document Tools:');
    documentTools.forEach(tool => console.log(`   • ${tool.name} - ${tool.description?.substring(0, 60)}...`));
  }
  
  if (analysisTools.length > 0) {
    console.log('🔍 Search & Analysis Tools:');
    analysisTools.forEach(tool => console.log(`   • ${tool.name} - ${tool.description?.substring(0, 60)}...`));
  }
  
  if (otherTools.length > 0) {
    console.log('🔧 Other Tools:');
    otherTools.forEach(tool => console.log(`   • ${tool.name} - ${tool.description?.substring(0, 60)}...`));
  }
  
  console.log(`\n🧠 Claude will intelligently select from ${this.availableTools.length} total tools based on user queries`);
  
  // Debug: Check for duplicates
  this.debugToolDuplicates();
}

// Add these helper methods to MCPClientManager class
private isAidboxFHIRTool(tool: any): boolean {
  const aidboxFHIRToolNames = [
    'searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient',
    'getPatientObservations', 'createObservation',
    'getPatientMedications', 'createMedicationRequest',
    'getPatientConditions', 'createCondition',
    'getPatientEncounters', 'createEncounter'
  ];
  
  return aidboxFHIRToolNames.includes(tool.name);
}

private isDocumentTool(tool: any): boolean {
  const documentToolNames = [
    'uploadDocument', 'searchDocuments', 'listDocuments',
    'chunkAndEmbedDocument', 'generateEmbeddingLocal'
  ];
  
  return documentToolNames.includes(tool.name);
}

private isAnalysisTool(tool: any): boolean {
  const analysisToolNames = [
    'analyzePatientHistory', 'findSimilarCases', 'getMedicalInsights',
    'extractMedicalEntities', 'semanticSearchLocal'
  ];
  
  return analysisToolNames.includes(tool.name);
}

  // Debug method to identify duplicate tools
  private debugToolDuplicates(): void {
    const toolNames = this.availableTools.map(t => t.name);
    const nameCount = new Map<string, number>();
    
    toolNames.forEach(name => {
      nameCount.set(name, (nameCount.get(name) || 0) + 1);
    });
    
    const duplicates = Array.from(nameCount.entries())
      .filter(([name, count]) => count > 1);
    
    if (duplicates.length > 0) {
      console.error('❌ DUPLICATE TOOL NAMES FOUND:');
      duplicates.forEach(([name, count]) => {
        console.error(`  • ${name}: appears ${count} times`);
      });
    } else {
      console.log('✅ All tool names are unique');
    }
  }

  // Filter tools based on user's specified data source
  private filterToolsByDataSource(tools: any[], dataSource: string): any[] {
    if (dataSource.toLowerCase().includes('mongodb') || dataSource.toLowerCase().includes('atlas')) {
      // User wants MongoDB/Atlas - return only document tools
      return tools.filter(tool => 
        tool.name.includes('Document') || 
        tool.name.includes('search') || 
        tool.name.includes('upload') || 
        tool.name.includes('extract') || 
        tool.name.includes('Medical') ||
        tool.name.includes('Similar') ||
        tool.name.includes('Insight') ||
        (tool.name.includes('search') && !tool.name.includes('Patient'))
      );
    }
    
    if (dataSource.toLowerCase().includes('aidbox') || dataSource.toLowerCase().includes('fhir')) {
      // User wants Aidbox - return only FHIR tools
      return tools.filter(tool => 
        (tool.name.includes('Patient') || 
         tool.name.includes('Observation') || 
         tool.name.includes('Medication') || 
         tool.name.includes('Condition') || 
         tool.name.includes('Encounter') ||
         tool.name === 'searchPatients') &&
        !tool.description?.toLowerCase().includes('epic')
      );
    }
    
    if (dataSource.toLowerCase().includes('epic') || dataSource.toLowerCase().includes('ehr')) {
      // User wants Epic - return only Epic tools
      return tools.filter(tool => 
        tool.description?.toLowerCase().includes('epic') ||
        tool.name.includes('getPatientDetails') ||
        tool.name.includes('getPatientObservations') ||
        tool.name.includes('getPatientMedications') ||
        tool.name.includes('getPatientConditions') ||
        tool.name.includes('getPatientEncounters') ||
        (tool.name === 'searchPatients' && tool.description?.toLowerCase().includes('epic'))
      );
    }
    
    // No specific preference, return all tools
    return tools;
  }

  // Analyze query to understand user's intent about data sources
  private analyzeQueryIntent(query: string): { dataSource?: string; intent?: string } {
    const lowerQuery = query.toLowerCase();
    
    // Check for explicit data source mentions
    if (lowerQuery.includes('epic') || lowerQuery.includes('ehr')) {
      return {
        dataSource: 'Epic EHR',
        intent: 'Search Epic EHR patient data'
      };
    }
    
    if (lowerQuery.includes('mongodb') || lowerQuery.includes('atlas')) {
      return {
        dataSource: 'MongoDB Atlas',
        intent: 'Search uploaded documents and medical records'
      };
    }
    
    if (lowerQuery.includes('aidbox') || lowerQuery.includes('fhir')) {
      return {
        dataSource: 'Aidbox FHIR',
        intent: 'Search structured patient data'
      };
    }
    
    // Check for document-related terms
    if (lowerQuery.includes('document') || lowerQuery.includes('upload') || lowerQuery.includes('file')) {
      return {
        dataSource: 'MongoDB Atlas (documents)',
        intent: 'Work with uploaded medical documents'
      };
    }
    
    // Check for patient search patterns
    if (lowerQuery.includes('search for patient') || lowerQuery.includes('find patient')) {
      // Default to Epic for patient searches unless specified
      return {
        dataSource: 'Epic EHR',
        intent: 'Search for patient information'
      };
    }
    
    return {};
  }

  // Convert tools to Anthropic format with strict deduplication
  private getAnthropicTools(): any[] {
    // Use Map to ensure uniqueness by tool name
    const uniqueTools = new Map<string, any>();
    
    this.availableTools.forEach(tool => {
      if (!uniqueTools.has(tool.name)) {
        uniqueTools.set(tool.name, {
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: "object",
            properties: tool.inputSchema?.properties || {},
            required: tool.inputSchema?.required || []
          }
        });
      } else {
        console.warn(`⚠️ Skipping duplicate tool in Anthropic format: ${tool.name}`);
      }
    });
    
    const toolsArray = Array.from(uniqueTools.values());
    console.log(`🔧 Prepared ${toolsArray.length} unique tools for Anthropic (from ${this.availableTools.length} total)`);
    
    return toolsArray;
  }

  // Validate tools before sending to Anthropic (additional safety check)
  private validateToolsForAnthropic(): any[] {
    const tools = this.getAnthropicTools();
    
    // Final check for duplicates
    const nameSet = new Set<string>();
    const validTools: any[] = [];
    
    tools.forEach(tool => {
      if (!nameSet.has(tool.name)) {
        nameSet.add(tool.name);
        validTools.push(tool);
      } else {
        console.error(`❌ CRITICAL: Duplicate tool found in final validation: ${tool.name}`);
      }
    });
    
    if (validTools.length !== tools.length) {
      console.warn(`🧹 Removed ${tools.length - validTools.length} duplicate tools in final validation`);
    }
    
    console.log(`✅ Final validation: ${validTools.length} unique tools ready for Anthropic`);
    return validTools;
  }

  // Route tool calls to appropriate MCP server
// Fix for imports/api/mcp/mcpClientManager.ts
// Replace the callMCPTool method with proper routing

public async callMCPTool(toolName: string, args: any): Promise<any> {
  console.log(`🔧 Routing tool: ${toolName} with args:`, JSON.stringify(args, null, 2));
  
  // Epic tools - MUST go to Epic MCP Server (port 3003)
  const epicToolNames = [
    'epicSearchPatients', 
    'epicGetPatientDetails',
    'epicGetPatientObservations', 
    'epicGetPatientMedications', 
    'epicGetPatientConditions', 
    'epicGetPatientEncounters'
  ];

  if (epicToolNames.includes(toolName)) {
    if (!this.epicConnection) {
      throw new Error('Epic MCP Server not connected - cannot call Epic tools');
    }
    
    console.log(`🏥 Routing ${toolName} to Epic MCP Server (port 3003)`);
    try {
      const result = await this.epicConnection.callTool(toolName, args);
      console.log(`✅ Epic tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Epic tool ${toolName} failed:`, error);
      throw new Error(`Epic tool ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Aidbox tools - MUST go to Aidbox MCP Server (port 3002)
  const aidboxToolNames = [
    'searchPatients', 'getPatientDetails', 'createPatient', 'updatePatient',
    'getPatientObservations', 'createObservation',
    'getPatientMedications', 'createMedicationRequest', 
    'getPatientConditions', 'createCondition',
    'getPatientEncounters', 'createEncounter',
    // Also handle renamed aidbox tools if they exist
    'aidboxSearchPatients', 'aidboxGetPatientDetails', 'aidboxCreatePatient', 'aidboxUpdatePatient',
    'aidboxGetPatientObservations', 'aidboxCreateObservation',
    'aidboxGetPatientMedications', 'aidboxCreateMedicationRequest',
    'aidboxGetPatientConditions', 'aidboxCreateCondition',
    'aidboxGetPatientEncounters', 'aidboxCreateEncounter'
  ];

  if (aidboxToolNames.includes(toolName)) {
    if (!this.aidboxConnection) {
      throw new Error('Aidbox MCP Server not connected - cannot call Aidbox tools');
    }
    
    console.log(`🏥 Routing ${toolName} to Aidbox MCP Server (port 3002)`);
    try {
      // Handle renamed tools by converting back to original name
      let actualToolName = toolName;
      if (toolName.startsWith('aidbox')) {
        // Convert aidboxSearchPatients → searchPatients
        actualToolName = toolName.charAt(6).toLowerCase() + toolName.slice(7);
        console.log(`🔄 Converting renamed tool: ${toolName} → ${actualToolName}`);
      }
      
      const result = await this.aidboxConnection.callTool(actualToolName, args);
      console.log(`✅ Aidbox tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Aidbox tool ${toolName} failed:`, error);
      throw new Error(`Aidbox tool ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Medical/Document tools - Go to Medical MCP Server (port 3001)
  const medicalToolNames = [
    // Document tools
    'uploadDocument', 'searchDocuments', 'listDocuments',
    'generateEmbeddingLocal', 'chunkAndEmbedDocument',
    
    // Analysis tools
    'extractMedicalEntities', 'findSimilarCases', 'analyzePatientHistory',
    'getMedicalInsights', 'semanticSearchLocal',
    
    // Legacy tools
    'upload_document', 'extract_text', 'extract_medical_entities',
    'search_by_diagnosis', 'semantic_search', 'get_patient_summary'
  ];

  if (medicalToolNames.includes(toolName)) {
    if (!this.medicalConnection) {
      throw new Error('Medical MCP Server not connected - cannot call medical/document tools');
    }
    
    console.log(`📋 Routing ${toolName} to Medical MCP Server (port 3001)`);
    try {
      const result = await this.medicalConnection.callTool(toolName, args);
      console.log(`✅ Medical tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Medical tool ${toolName} failed:`, error);
      throw new Error(`Medical tool ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Unknown tool - check if it exists in available tools
  const availableTool = this.availableTools.find(t => t.name === toolName);
  if (!availableTool) {
    const availableToolNames = this.availableTools.map(t => t.name).join(', ');
    throw new Error(`Tool '${toolName}' is not available. Available tools: ${availableToolNames}`);
  }

  // If we get here, the tool exists but we don't know which server it belongs to
  // This shouldn't happen with proper categorization
  console.warn(`⚠️ Unknown tool routing for: ${toolName}. Defaulting to Medical server.`);
  
  if (!this.medicalConnection) {
    throw new Error('Medical MCP Server not connected');
  }
  
  try {
    const result = await this.medicalConnection.callTool(toolName, args);
    console.log(`✅ Tool ${toolName} completed successfully (default routing)`);
    return result;
  } catch (error) {
    console.error(`❌ Tool ${toolName} failed on default routing:`, error);
    throw new Error(`Tool ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

  // Convenience method for Epic tool calls
  public async callEpicTool(toolName: string, args: any): Promise<any> {
    if (!this.epicConnection) {
      throw new Error('Epic MCP Server not connected');
    }

    try {
      console.log(`🏥 Calling Epic tool: ${toolName}`, args);
      const result = await this.epicConnection.callTool(toolName, args);
      console.log(`✅ Epic tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`❌ Epic tool ${toolName} failed:`, error);
      throw error;
    }
  }

  // Health check for all servers
  public async healthCheck(): Promise<{ epic: boolean; aidbox: boolean; medical: boolean }> {
    const health = {
      epic: false,
      aidbox: false,
      medical: false
    };

    // Check Epic server
    if (this.epicConnection) {
      try {
        const epicHealth = await fetch('http://localhost:3003/health');
        health.epic = epicHealth.ok;
      } catch (error) {
        console.warn('Epic health check failed:', error);
      }
    }

    // Check Aidbox server
    if (this.aidboxConnection) {
      try {
        const aidboxHealth = await fetch('http://localhost:3002/health');
        health.aidbox = aidboxHealth.ok;
      } catch (error) {
        console.warn('Aidbox health check failed:', error);
      }
    }

    // Check Medical server
    if (this.medicalConnection) {
      try {
        const medicalHealth = await fetch('http://localhost:3001/health');
        health.medical = medicalHealth.ok;
      } catch (error) {
        console.warn('Medical health check failed:', error);
      }
    }

    return health;
  }

  // Main intelligent query processing method
  public async processQueryWithIntelligentToolSelection(
    query: string,
    context?: { documentId?: string; patientId?: string; sessionId?: string }
  ): Promise<string> {
    if (!this.isInitialized || !this.config) {
      throw new Error('MCP Client not initialized');
    }

    console.log(`🧠 Processing query with intelligent tool selection: "${query}"`);

    try {
      if (this.config.provider === 'anthropic' && this.anthropic) {
        return await this.processWithAnthropicIntelligent(query, context);
      } else if (this.config.provider === 'ozwell') {
        return await this.processWithOzwellIntelligent(query, context);
      }
      
      throw new Error('No LLM provider configured');
    } catch (error: any) {
      console.error('Error processing query with intelligent tool selection:', error);
      
      // Handle specific error types
      if (error.status === 529 || error.message?.includes('Overloaded')) {
        return 'I\'m experiencing high demand right now. Please try your query again in a moment. The system should respond normally after a brief wait.';
      }
      
      if (error.message?.includes('not connected')) {
        return 'I\'m having trouble connecting to the medical data systems. Please ensure the MCP servers are running and try again.';
      }
      
      if (error.message?.includes('API')) {
        return 'I encountered an API error while processing your request. Please try again in a moment.';
      }
      
      // For development/debugging
      if (process.env.NODE_ENV === 'development') {
        return `Error: ${error.message}`;
      }
      
      return 'I encountered an error while processing your request. Please try rephrasing your question or try again in a moment.';
    }
  }

  // Anthropic native tool calling with iterative support
  private async processWithAnthropicIntelligent(
    query: string, 
    context?: any
  ): Promise<string> {
    // Use validated tools to prevent duplicate errors
    let tools = this.validateToolsForAnthropic();
    
    // Analyze query to understand data source intent
    const queryIntent = this.analyzeQueryIntent(query);
    
    // Filter tools based on user's explicit data source preference
    if (queryIntent.dataSource) {
      tools = this.filterToolsByDataSource(tools, queryIntent.dataSource);
      console.log(`🎯 Filtered to ${tools.length} tools based on data source: ${queryIntent.dataSource}`);
      console.log(`🔧 Available tools after filtering: ${tools.map(t => t.name).join(', ')}`);
    }
    
    // Build context information
    let contextInfo = '';
    if (context?.patientId) {
      contextInfo += `\nCurrent patient context: ${context.patientId}`;
    }
    if (context?.sessionId) {
      contextInfo += `\nSession context available`;
    }
    
    // Add query intent to context
    if (queryIntent.dataSource) {
      contextInfo += `\nUser specified data source: ${queryIntent.dataSource}`;
    }
    if (queryIntent.intent) {
      contextInfo += `\nQuery intent: ${queryIntent.intent}`;
    }

    const systemPrompt = `You are a medical AI assistant with access to multiple healthcare data systems:

🏥 **Epic EHR Tools** - For Epic EHR patient data, observations, medications, conditions, encounters
🏥 **Aidbox FHIR Tools** - For FHIR-compliant patient data, observations, medications, conditions, encounters  
📄 **Medical Document Tools** - For document upload, search, and medical entity extraction (MongoDB Atlas)
🔍 **Semantic Search** - For finding similar cases and medical insights (MongoDB Atlas)

**CRITICAL: Pay attention to which data source the user mentions:**

- If user mentions "Epic" or "EHR" → Use Epic EHR tools
- If user mentions "Aidbox" or "FHIR" → Use Aidbox FHIR tools
- If user mentions "MongoDB", "Atlas", "documents", "uploaded files" → Use document search tools
- If user mentions "diagnosis in MongoDB" → Search documents, NOT Epic/Aidbox
- If no specific source mentioned → Choose based on context (Epic for patient searches, Aidbox for FHIR, documents for uploads)

**Available Context:**${contextInfo}

**Instructions:**
1. **LISTEN TO USER'S DATA SOURCE PREFERENCE** - If they say Epic, use Epic tools; if MongoDB/Atlas, use document tools
2. For Epic/Aidbox queries, use patient search first to get IDs, then specific data tools
3. For document queries, use search and upload tools
4. Provide clear, helpful medical information
5. Always explain what data sources you're using

Be intelligent about tool selection AND respect the user's specified data source.`;

    let conversationHistory: any[] = [{ role: 'user', content: query }];
    let finalResponse = '';
    let iterations = 0;
    const maxIterations = 7; // Reduced to avoid API overload
    const maxRetries = 3;

    while (iterations < maxIterations) {
      console.log(`🔄 Iteration ${iterations + 1} - Asking Claude to decide on tools`);
      console.log(`🔧 Using ${tools.length} validated tools`);
      
      let retryCount = 0;
      let response;
      
      // Add retry logic for API overload
      while (retryCount < maxRetries) {
        try {
          response = await this.anthropic!.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000, // Reduced to avoid overload
            system: systemPrompt,
            messages: conversationHistory,
            tools: tools,
            tool_choice: { type: 'auto' }
          });
          break; // Success, exit retry loop
        } catch (error: any) {
          if (error.status === 529 && retryCount < maxRetries - 1) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            console.warn(`⚠️ Anthropic API overloaded, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw error; // Re-throw if not retryable or max retries reached
          }
        }
      }
      
      if (!response) {
        throw new Error('Failed to get response from Anthropic after retries');
      }

      let hasToolUse = false;
      let assistantResponse: any[] = [];
      
      for (const content of response.content) {
        assistantResponse.push(content);
        
        if (content.type === 'text') {
          finalResponse += content.text;
          console.log(`💬 Claude says: ${content.text.substring(0, 100)}...`);
        } else if (content.type === 'tool_use') {
          hasToolUse = true;
          console.log(`🔧 Claude chose tool: ${content.name} with args:`, content.input);
          
          try {
            const toolResult = await this.callMCPTool(content.name, content.input);
            console.log(`✅ Tool ${content.name} executed successfully`);
            
            // Add tool result to conversation
            conversationHistory.push(
              { role: 'assistant', content: assistantResponse }
            );
            
            conversationHistory.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: content.id,
                content: this.formatToolResult(toolResult)
              }]
            });
            
          } catch (error) {
            console.error(`❌ Tool ${content.name} failed:`, error);
            
            conversationHistory.push(
              { role: 'assistant', content: assistantResponse }
            );
            
            conversationHistory.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: content.id,
                content: `Error executing tool: ${error.message}`,
                is_error: true
              }]
            });
          }
          
          // Clear the current response since we're continuing the conversation
          finalResponse = '';
          break; // Process one tool at a time
        }
      }

      if (!hasToolUse) {
        // Claude didn't use any tools, so it's providing a final answer
        console.log('✅ Claude provided final answer without additional tools');
        break;
      }

      iterations++;
    }

    if (iterations >= maxIterations) {
      finalResponse += '\n\n*Note: Reached maximum tool iterations. Response may be incomplete.*';
    }

    return finalResponse || 'I was unable to process your request completely.';
  }

  // Format tool results for Claude
  private formatToolResult(result: any): string {
    try {
      // Handle different result formats
      if (result?.content?.[0]?.text) {
        return result.content[0].text;
      }
      
      if (typeof result === 'string') {
        return result;
      }
      
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return `Tool result formatting error: ${error.message}`;
    }
  }

  // Ozwell implementation with intelligent prompting
  private async processWithOzwellIntelligent(
    query: string, 
    context?: any
  ): Promise<string> {
    const endpoint = this.config?.ozwellEndpoint || 'https://ai.bluehive.com/api/v1/completion';
    
    const availableToolsDescription = this.availableTools.map(tool => 
      `${tool.name}: ${tool.description}`
    ).join('\n');
    
    const systemPrompt = `You are a medical AI assistant with access to these tools:

${availableToolsDescription}

The user's query is: "${query}"

Based on this query, determine what tools (if any) you need to use and provide a helpful response. If you need to use tools, explain what you would do, but note that in this mode you cannot actually execute tools.`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config?.apiKey}`,
        },
        body: JSON.stringify({
          prompt: systemPrompt,
          max_tokens: 1000,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ozwell API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.choices?.[0]?.text || data.completion || data.response || 'No response generated';
    } catch (error) {
      console.error('Ozwell API error:', error);
      throw new Error(`Failed to get response from Ozwell: ${error}`);
    }
  }

  // Backward compatibility methods
  public async processQueryWithMedicalContext(
    query: string,
    context?: { documentId?: string; patientId?: string; sessionId?: string }
  ): Promise<string> {
    // Route to intelligent tool selection
    return this.processQueryWithIntelligentToolSelection(query, context);
  }

  // Utility methods
  public getAvailableTools(): any[] {
    return this.availableTools;
  }

  public isToolAvailable(toolName: string): boolean {
    return this.availableTools.some(tool => tool.name === toolName);
  }

  public getMedicalOperations(): MedicalDocumentOperations {
    if (!this.medicalOperations) {
      throw new Error('Medical MCP server not connected');
    }
    return this.medicalOperations;
  }

  public getEpicOperations(): EpicFHIROperations | undefined {
    return this.epicOperations;
  }

  public getAidboxOperations(): AidboxFHIROperations | undefined {
    return this.aidboxOperations;
  }

  // Provider switching methods
  public async switchProvider(provider: 'anthropic' | 'ozwell'): Promise<void> {
    if (!this.config) {
      throw new Error('MCP Client not initialized');
    }

    this.config.provider = provider;
    console.log(`🔄 Switched to ${provider.toUpperCase()} provider with intelligent tool selection`);
  }

  public getCurrentProvider(): 'anthropic' | 'ozwell' | undefined {
    return this.config?.provider;
  }

  public getAvailableProviders(): string[] {
    const settings = (global as any).Meteor?.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    
    const providers = [];
    if (anthropicKey) providers.push('anthropic');
    if (ozwellKey) providers.push('ozwell');
    
    return providers;
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public getConfig(): MCPClientConfig | undefined {
    return this.config;
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down MCP Clients...');
    
    if (this.medicalConnection) {
      this.medicalConnection.disconnect();
    }
    
    if (this.aidboxConnection) {
      this.aidboxConnection.disconnect();
    }
    
    if (this.epicConnection) {
      this.epicConnection.disconnect();
    }
    
    this.isInitialized = false;
  }
}