import Anthropic from '@anthropic-ai/sdk';
import { MedicalServerConnection, MedicalDocumentOperations, createMedicalOperations } from './medicalServerConnection';

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
  
  // Medical MCP connection
  private medicalConnection?: MedicalServerConnection;
  private medicalOperations?: MedicalDocumentOperations;
  private availableTools: any[] = [];

  private constructor() {}

  public static getInstance(): MCPClientManager {
    if (!MCPClientManager.instance) {
      MCPClientManager.instance = new MCPClientManager();
    }
    return MCPClientManager.instance;
  }

  public async initialize(config: MCPClientConfig): Promise<void> {
    console.log('Initializing MCP Client with config:', { 
      provider: config.provider, 
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey?.length,
      ozwellEndpoint: config.ozwellEndpoint
    });
    
    this.config = config;

    try {
      if (config.provider === 'anthropic') {
        console.log('Creating Anthropic client...');
        this.anthropic = new Anthropic({
          apiKey: config.apiKey,
        });
        console.log('Anthropic client created successfully');
      } else if (config.provider === 'ozwell') {
        console.log('Ozwell provider configured with endpoint:', config.ozwellEndpoint);
      }

      this.isInitialized = true;
      console.log('✅ MCP Client initialized successfully with provider:', config.provider);
    } catch (error) {
      console.error('❌ Failed to initialize MCP client:', error);
      throw error;
    }
  }

  // Connect to medical MCP server via stdio
  public async connectToMedicalServer(): Promise<void> {
    try {
      this.medicalConnection = new MedicalServerConnection();
      await this.medicalConnection.connect();
      this.medicalOperations = createMedicalOperations(this.medicalConnection);
      
      // List available tools after connection
      try {
        const toolsResult = await this.medicalConnection.listTools();
        this.availableTools = toolsResult.tools || [];
        console.log(`✅ Medical MCP Server connected with ${this.availableTools.length} tools available`);
        
        // Log available tools
        if (this.availableTools.length > 0) {
          console.log('📋 Available MCP Tools:');
          this.availableTools.forEach((tool, index) => {
            console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
          });
        }
      } catch (error) {
        console.error('Failed to list tools:', error);
      }
      
    } catch (error) {
      console.error('❌ Failed to connect to Medical MCP Server:', error);
      throw error;
    }
  }

  // Get available tools
  public getAvailableTools(): any[] {
    return this.availableTools;
  }

  // Check if a specific tool is available
  public isToolAvailable(toolName: string): boolean {
    return this.availableTools.some(tool => tool.name === toolName);
  }

  // Get medical document operations
  public getMedicalOperations(): MedicalDocumentOperations {
    if (!this.medicalOperations) {
      throw new Error('Medical MCP server not connected');
    }
    return this.medicalOperations;
  }

  // Call a specific MCP tool
  public async callMCPTool(toolName: string, args: any): Promise<any> {
    if (!this.medicalConnection) {
      throw new Error('Medical MCP server not connected');
    }

    if (!this.isToolAvailable(toolName)) {
      throw new Error(`Tool '${toolName}' is not available. Available tools: ${this.availableTools.map(t => t.name).join(', ')}`);
    }

    try {
      const result = await this.medicalConnection.callTool(toolName, args);
      return result;
    } catch (error) {
      console.error(`Error calling MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  public async switchProvider(provider: 'anthropic' | 'ozwell'): Promise<void> {
    if (!this.config) {
      throw new Error('MCP Client not initialized');
    }

    this.config.provider = provider;
    console.log(`🔄 Switched to ${provider.toUpperCase()} provider`);
  }

  public async processQuery(query: string): Promise<string> {
    console.log('Processing query with provider:', this.config?.provider);
    
    if (!this.isInitialized || !this.config) {
      const error = 'MCP Client not initialized';
      console.error(error);
      throw new Error(error);
    }

    try {
      if (this.config.provider === 'anthropic' && this.anthropic) {
        console.log('Using Anthropic for processing...');
        return await this.processWithAnthropic(query);
      } else if (this.config.provider === 'ozwell') {
        console.log('Using Ozwell for processing...');
        return await this.processWithOzwell(query);
      }
      throw new Error('No LLM provider configured');
    } catch (error) {
      console.error('Error processing query:', error);
      throw error;
    }
  }

  // Process query with medical context and automatic tool calling
  public async processQueryWithMedicalContext(
    query: string,
    context?: { documentId?: string; patientId?: string; sessionId?: string }
  ): Promise<string> {
    if (!this.isInitialized || !this.config) {
      throw new Error('MCP Client not initialized');
    }

    try {
      let enhancedQuery = query;
      let medicalContext = '';

      // If query mentions medical terms or patient, search for context
      if (this.medicalOperations && this.isMedicalQuery(query)) {
        try {
          // Use the new searchDocuments method
          const searchResult = await this.medicalOperations.searchDocuments(query, {
            filter: context?.patientId ? { patientId: context.patientId } : {},
            limit: 3
          });
          
          if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
            medicalContext = `\n\nRelevant medical context:\n${JSON.stringify(searchResult.results[0], null, 2)}`;
          }
        } catch (error) {
          console.error('Error fetching medical context:', error);
        }
      }

      // Check if query requires specific MCP tools
      const toolsContext = this.buildToolsContext(query);
      if (toolsContext) {
        enhancedQuery += `\n\nAvailable MCP Tools: ${toolsContext}`;
      }

      // Process with LLM
      if (this.config.provider === 'anthropic' && this.anthropic) {
        return await this.processWithAnthropic(enhancedQuery + medicalContext);
      } else if (this.config.provider === 'ozwell') {
        return await this.processWithOzwell(enhancedQuery + medicalContext);
      }
      
      throw new Error('No LLM provider configured');
    } catch (error) {
      console.error('Error processing query with medical context:', error);
      throw error;
    }
  }

  private buildToolsContext(query: string): string {
    if (this.availableTools.length === 0) {
      return '';
    }

    // Determine which tools might be relevant to the query
    const relevantTools = this.availableTools.filter(tool => {
      const toolKeywords = tool.name.toLowerCase() + ' ' + tool.description.toLowerCase();
      const queryLower = query.toLowerCase();
      
      return (
        queryLower.includes('upload') && toolKeywords.includes('upload') ||
        queryLower.includes('search') && toolKeywords.includes('search') ||
        queryLower.includes('list') && toolKeywords.includes('list') ||
        queryLower.includes('extract') && toolKeywords.includes('extract') ||
        queryLower.includes('analyze') && toolKeywords.includes('analyze') ||
        queryLower.includes('similar') && toolKeywords.includes('similar') ||
        queryLower.includes('insight') && toolKeywords.includes('insight')
      );
    });

    if (relevantTools.length > 0) {
      return relevantTools.map(tool => `${tool.name}: ${tool.description}`).join(', ');
    }

    return '';
  }

  private isMedicalQuery(query: string): boolean {
    const medicalKeywords = [
      'diagnosis', 'medication', 'prescription', 'lab', 'test', 'result',
      'patient', 'medical', 'health', 'treatment', 'symptom', 'condition',
      'blood', 'pressure', 'glucose', 'cholesterol', 'vital', 'sign',
      'doctor', 'physician', 'hospital', 'clinic', 'surgery', 'procedure'
    ];
    
    const lowerQuery = query.toLowerCase();
    return medicalKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  private async processWithAnthropic(query: string): Promise<string> {
    const systemPrompt = `You are a medical AI assistant with access to MCP (Model Context Protocol) tools for medical document processing. 

Available MCP Tools:
${this.availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

When users ask about medical documents, patient data, or need medical analysis, you can suggest using these MCP tools. Always be helpful and provide accurate medical information while being clear about limitations.`;

    const response = await this.anthropic!.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    });

    if (response.content[0].type === 'text') {
      return response.content[0].text;
    }

    return 'No response generated';
  }

  private async processWithOzwell(query: string): Promise<string> {
    const endpoint = this.config?.ozwellEndpoint || 'https://ai.bluehive.com/api/v1/completion';
    
    const systemPrompt = `You are a medical AI assistant with access to MCP tools for medical document processing. Available tools: ${this.availableTools.map(t => t.name).join(', ')}`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config?.apiKey}`,
        },
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\nUser: ${query}`,
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

  public isReady(): boolean {
    return this.isInitialized;
  }

  public getConfig(): MCPClientConfig | undefined {
    return this.config;
  }

  public getCurrentProvider(): 'anthropic' | 'ozwell' | undefined {
    return this.config?.provider;
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down MCP Clients...');
    
    if (this.medicalConnection) {
      this.medicalConnection.disconnect();
    }
    
    this.isInitialized = false;
  }
}

