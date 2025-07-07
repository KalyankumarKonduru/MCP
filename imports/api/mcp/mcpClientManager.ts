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
  
  // Medical MCP connection (Streamable HTTP)
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

  // Connect to medical MCP server via Streamable HTTP
  public async connectToMedicalServer(): Promise<void> {
    try {
      // Get the MCP server URL from settings (default to localhost:3001)
      const settings = (global as any).Meteor?.settings?.private;
      const mcpServerUrl = settings?.MEDICAL_MCP_SERVER_URL || 
                           process.env.MEDICAL_MCP_SERVER_URL || 
                           'http://localhost:3001';
      
      console.log(`📄 Attempting to connect to Medical MCP Server at: ${mcpServerUrl}`);
      
      this.medicalConnection = new MedicalServerConnection(mcpServerUrl);
      await this.medicalConnection.connect();
      this.medicalOperations = createMedicalOperations(this.medicalConnection);
      
      // List available tools after connection
      try {
        const toolsResult = await this.medicalConnection.listTools();
        this.availableTools = toolsResult.tools || [];
        console.log(`✅ Medical MCP Server connected via Streamable HTTP with ${this.availableTools.length} tools available`);
        
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
      console.error('❌ Medical MCP Server HTTP connection failed:', error);
      console.error('   Document processing features will be disabled.');
      console.error('   Make sure to:');
      console.error('   1. Start the MCP server in HTTP mode: npm run start:http');
      console.error('   2. Check the MCP server URL in settings.json is correct');
      console.error('   3. Verify the MCP server is accessible at the configured URL');
      console.error('   4. Check that MongoDB and OpenAI credentials are configured in the MCP server');
      console.error('   The server is running but MCP connection failed. Check server logs.');
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

  // Enhanced query processing with automatic tool calling and context
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
      let toolResults: any[] = [];

      console.log(`🧠 Processing query with medical context: "${query}"`);

      // 1. DETECT AND EXECUTE SEARCH QUERIES AUTOMATICALLY
      if (this.isDirectSearchQuery(query)) {
        try {
          const searchTerms = this.extractSearchTerms(query);
          console.log(`🔍 Auto-executing search for: "${searchTerms}"`);
          
          const searchResult = await this.callMCPTool('searchDocuments', {
            query: searchTerms,
            limit: 5,
            threshold: 0.3,
            searchType: 'hybrid',
            filter: context?.patientId ? { patientId: context.patientId } : {}
          });
          
          toolResults.push({
            tool: 'searchDocuments',
            query: searchTerms,
            result: searchResult
          });
          
          // Format results and return immediately for search queries
          return this.formatSearchResults(searchResult, query, searchTerms);
          
        } catch (error) {
          console.error('Auto-search failed:', error);
          return `I tried to search for "${query}" but encountered an error. Please try rephrasing your search or ensure medical documents have been uploaded to the system.`;
        }
      }

      // 2. GATHER MEDICAL CONTEXT for general queries
      if (this.medicalOperations && this.isMedicalQuery(query)) {
        try {
          console.log(`🏥 Gathering medical context for query`);
          const searchResult = await this.medicalOperations.searchDocuments(query, {
            filter: context?.patientId ? { patientId: context.patientId } : {},
            limit: 3,
            threshold: 0.4
          });
          
          if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
            medicalContext = `\n\n**Relevant Medical Information Found:**\n${this.summarizeSearchResults(searchResult.results)}`;
            toolResults.push({
              tool: 'contextSearch',
              result: searchResult
            });
          }
        } catch (error) {
          console.error('Error fetching medical context:', error);
        }
      }

      // 3. BUILD ENHANCED PROMPT with context and available tools
      if (toolResults.length > 0 && toolResults[0].tool === 'contextSearch') {
        enhancedQuery = `User Query: ${query}\n\nI found some relevant medical information that might help answer this question:\n${medicalContext}\n\nPlease provide a helpful answer based on this medical context and your knowledge.`;
      } else {
        enhancedQuery = query + medicalContext;
      }

      // Add available tools context for the LLM
      const toolsContext = this.buildToolsContext(query);
      if (toolsContext) {
        enhancedQuery += `\n\nNote: I have access to medical document tools if you need me to search for specific information: ${toolsContext}`;
      }

      // 4. PROCESS WITH LLM
      console.log(`🤖 Sending to LLM provider: ${this.config.provider}`);
      
      if (this.config.provider === 'anthropic' && this.anthropic) {
        return await this.processWithAnthropic(enhancedQuery);
      } else if (this.config.provider === 'ozwell') {
        return await this.processWithOzwell(enhancedQuery);
      }
      
      throw new Error('No LLM provider configured');
    } catch (error) {
      console.error('Error processing query with medical context:', error);
      throw error;
    }
  }

  // Helper methods for query processing
  private isDirectSearchQuery(query: string): boolean {
    const searchPatterns = [
      /^search\s+for\s+/i,
      /^find\s+/i,
      /^look\s+for\s+/i,
      /^show\s+me\s+/i,
      /^list\s+/i,
      /documents?\s+about/i,
      /records?\s+for/i,
      /files?\s+for/i
    ];
    
    return searchPatterns.some(pattern => pattern.test(query));
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

  private extractSearchTerms(query: string): string {
    return query
      .replace(/^(search\s+for|find|look\s+for|show\s+me|list|documents?\s+about|records?\s+for|files?\s+for)\s*/i, '')
      .replace(/\b(patient|documents?|records?|files?)\b/gi, '')
      .trim() || query;
  }

  private summarizeSearchResults(results: any[]): string {
    return results.slice(0, 2).map(result => 
      `- **${result.title}**: ${result.content?.substring(0, 150)}...`
    ).join('\n');
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

  private formatSearchResults(searchResult: any, originalQuery: string, searchTerms: string): string {
    try {
      console.log(`🔧 Formatting search results for query: "${originalQuery}"`);
      
      // Parse the MCP tool result
      let resultData;
      if (searchResult?.content?.[0]?.text) {
        try {
          resultData = JSON.parse(searchResult.content[0].text);
        } catch (parseError) {
          console.error('Failed to parse search result JSON:', parseError);
          return `I found some results but couldn't process them properly. Please try a different search.`;
        }
      } else {
        resultData = searchResult;
      }
      
      console.log(`📊 Parsed result data:`, resultData);
      
      if (!resultData?.success) {
        const errorMsg = resultData?.error || 'Unknown error occurred';
        return `I couldn't search the medical documents: ${errorMsg}. Please try uploading some documents first.`;
      }
      
      const results = resultData.results || [];
      console.log(`📈 Found ${results.length} results`);
      
      if (results.length === 0) {
        return `I searched for "${searchTerms}" but didn't find any matching medical documents.\n\n**Suggestions:**\n• Try different search terms (specific conditions, medications, or patient names)\n• Upload more medical documents to expand the database\n• Use broader search terms\n• Check if the documents contain the information you're looking for`;
      }
      
      // Format the results in a user-friendly way
      let response = `**Found ${results.length} medical document${results.length > 1 ? 's' : ''} for "${searchTerms}":**\n\n`;
      
      results.forEach((result: any, index: number) => {
        response += `**${index + 1}. ${result.title}**\n`;
        
        // Add relevance score
        if (result.score !== undefined) {
          const percentage = Math.round(result.score * 100);
          response += `📊 **Relevance:** ${percentage}%\n`;
        }
        
        // Add patient information
        if (result.metadata?.patientId && result.metadata.patientId !== 'Unknown Patient') {
          response += `👤 **Patient:** ${result.metadata.patientId}\n`;
        }
        
        // Add document type
        if (result.metadata?.documentType) {
          const type = result.metadata.documentType.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          response += `📋 **Type:** ${type}\n`;
        }
        
        // Add date
        if (result.metadata?.uploadedAt) {
          const date = new Date(result.metadata.uploadedAt).toLocaleDateString();
          response += `📅 **Date:** ${date}\n`;
        }
        
        // Add content preview
        if (result.content) {
          const preview = result.content.substring(0, 250).replace(/\n+/g, ' ').trim();
          response += `📄 **Content:** ${preview}${result.content.length > 250 ? '...' : ''}\n`;
        }
        
        // Add relevant medical entities if available
        if (result.relevantEntities && result.relevantEntities.length > 0) {
          const entities = result.relevantEntities
            .slice(0, 5)
            .map((e: any) => `${e.text} (${e.label.toLowerCase()})`)
            .join(', ');
          response += `🏷️ **Key Medical Terms:** ${entities}\n`;
        }
        
        response += '\n---\n\n';
      });
      
      // Add helpful suggestions
      response += `💡 **What you can do next:**\n`;
      response += `• Ask specific questions about these documents\n`;
      response += `• Search for specific conditions, medications, or symptoms\n`;
      response += `• Upload additional medical documents\n`;
      response += `• Request summaries or analysis of the found documents`;
      
      return response;
      
    } catch (error) {
      console.error('Error formatting search results:', error);
      return `I found some medical documents but had trouble formatting the results. Please try your search again.`;
    }
  }

  private async processWithAnthropic(query: string): Promise<string> {
    const systemPrompt = `You are a medical AI assistant with access to MCP (Model Context Protocol) tools for medical document processing. 

When users ask about medical information, provide clear, helpful responses. If medical context is provided in the query, use it to give specific answers. Always be helpful and provide accurate information while being clear about limitations.

Available MCP Tools:
${this.availableTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

Respond in a friendly, professional manner and format your responses for easy reading.`;

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
    
    const systemPrompt = `You are a medical AI assistant with access to MCP tools for medical document processing. Available tools: ${this.availableTools.map(t => t.name).join(', ')}. Provide clear, helpful responses about medical information.`;
    
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