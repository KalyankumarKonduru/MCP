import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { SessionsCollection } from '../sessions/sessions';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import { ContextManager } from '../context/contextManager';

// Helper functions (moved outside of Meteor.methods)
function isSearchQuery(query: string): boolean {
  const searchIndicators = [
    'search for', 'find', 'look for', 'show me', 'list', 
    'documents about', 'patient', 'records for', 'documents for'
  ];
  
  const lowerQuery = query.toLowerCase();
  return searchIndicators.some(indicator => lowerQuery.includes(indicator));
}

function isDocumentQuery(query: string): boolean {
  const documentIndicators = [
    'documents', 'files', 'records', 'reports', 'charts',
    'diagnosis', 'medication', 'prescription', 'treatment',
    'lab results', 'test results', 'medical history'
  ];
  
  const lowerQuery = query.toLowerCase();
  return documentIndicators.some(indicator => lowerQuery.includes(indicator));
}

function extractSearchTerms(query: string): string {
  // Remove common search phrases to get the actual search terms
  const cleanQuery = query
    .replace(/^(search for|find|look for|show me|list|documents about|records for|files for)\s*/i, '')
    .replace(/\b(patient|documents?|records?|files?|charts?)\b/gi, '')
    .replace(/\b(any|some|all)\b/gi, '')
    .trim();
  
  return cleanQuery || query;
}

function extractKeyTerms(query: string): string | null {
  const medicalTerms = [
    'diabetes', 'hypertension', 'cancer', 'heart', 'blood pressure',
    'medication', 'prescription', 'drug', 'treatment', 'diagnosis',
    'lab', 'test', 'result', 'report', 'x-ray', 'scan', 'mri'
  ];
  
  const lowerQuery = query.toLowerCase();
  const foundTerms = medicalTerms.filter(term => lowerQuery.includes(term));
  
  return foundTerms.length > 0 ? foundTerms.join(' ') : null;
}

function formatSearchResults(searchResult: any, originalQuery: string, searchTerms: string): string {
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
      return `I searched for "${searchTerms}" but didn't find any matching medical documents. Try:\n\n• Different search terms (e.g., specific conditions, medications, or patient names)\n• Uploading more medical documents\n• Using broader search terms`;
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
    return `I found some medical documents but had trouble formatting the results. The search worked, but there was a display error. Please try your search again.`;
  }
}

async function handleSearchQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`🔍 Processing search query: "${query}"`);
    
    // Extract search terms
    const searchTerms = extractSearchTerms(query);
    console.log(`📝 Extracted search terms: "${searchTerms}"`);
    
    // Get context if sessionId provided
    let filter = {};
    if (sessionId) {
      const context = await ContextManager.getContext(sessionId);
      if (context.patientContext) {
        filter = { patientId: context.patientContext };
      }
    }
    
    // Call the search tool directly
    const searchResult = await mcpManager.callMCPTool('searchDocuments', {
      query: searchTerms,
      limit: 5,
      threshold: 0.3,
      searchType: 'hybrid',
      filter
    });
    
    console.log(`📊 Search result:`, searchResult);
    
    // Update session with found documents
    if (sessionId && searchResult?.content?.[0]?.text) {
      try {
        const resultData = JSON.parse(searchResult.content[0].text);
        if (resultData.results && resultData.results.length > 0) {
          const documentIds = resultData.results.map((r: any) => r.id).filter(Boolean);
          await SessionsCollection.updateAsync(sessionId, {
            $addToSet: {
              'metadata.documentIds': { $each: documentIds }
            }
          });
        }
      } catch (e) {
        console.error('Error updating session with document IDs:', e);
      }
    }
    
    // Process and format the results for the user
    return formatSearchResults(searchResult, query, searchTerms);
  } catch (error) {
    console.error('Search query error:', error);
    return `I tried to search for "${query}" but encountered an error: ${error.message}. Please try rephrasing your search or check if documents have been uploaded.`;
  }
}

async function handleDocumentQuery(query: string, mcpManager: any, sessionId?: string): Promise<string> {
  try {
    console.log(`📋 Processing document query: "${query}"`);
    
    // First try to search for relevant documents
    const searchTerms = extractKeyTerms(query);
    
    if (searchTerms) {
      const searchResult = await mcpManager.callMCPTool('searchDocuments', {
        query: searchTerms,
        limit: 3,
        threshold: 0.4,
        searchType: 'hybrid'
      });
      
      // If we found relevant documents, format them nicely
      const formattedResults = formatSearchResults(searchResult, query, searchTerms);
      
      // Build context if sessionId provided
      let contextPrompt = '';
      if (sessionId) {
        const context = await ContextManager.getContext(sessionId);
        contextPrompt = ContextManager.buildContextPrompt(context);
      }
      
      // Then get the LLM to provide additional context
      const llmPrompt = `${contextPrompt}\n\nBased on this search query "${query}" and these document results:\n\n${formattedResults}\n\nPlease provide a helpful summary and answer any specific questions about the medical information found.`;
      
      const llmResponse = await mcpManager.processQueryWithMedicalContext(llmPrompt, { sessionId });
      
      return llmResponse;
    } else {
      // Fallback to regular processing
      return await mcpManager.processQueryWithMedicalContext(query, { sessionId });
    }
  } catch (error) {
    console.error('Document query error:', error);
    return `I tried to process your query about medical documents but encountered an error: ${error.message}`;
  }
}

Meteor.methods({
  async 'messages.insert'(messageData: Omit<Message, '_id'>) {
    check(messageData, {
      content: String,
      role: String,
      timestamp: Date,
      sessionId: String
    });

    const messageId = await MessagesCollection.insertAsync(messageData);
    
    // Update context if session exists
    if (messageData.sessionId) {
      await ContextManager.updateContext(messageData.sessionId, {
        ...messageData,
        _id: messageId
      });
      
      // Update session
      await SessionsCollection.updateAsync(messageData.sessionId, {
        $set: {
          lastMessage: messageData.content.substring(0, 100),
          updatedAt: new Date()
        },
        $inc: { messageCount: 1 }
      });
      
      // Auto-generate title after first user message
      const session = await SessionsCollection.findOneAsync(messageData.sessionId);
      if (session && session.messageCount <= 2 && messageData.role === 'user') {
        Meteor.setTimeout(() => {
          Meteor.call('sessions.generateTitle', messageData.sessionId);
        }, 100);
      }
    }
    
    return messageId;
  },

  async 'mcp.processQuery'(query: string, sessionId?: string) {
    check(query, String);
    check(sessionId, Match.Maybe(String));
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return 'MCP Client is not ready. Please check your API configuration.';
      }
      
      try {
        // Get context if sessionId provided
        let contextPrompt = '';
        let contextData = {};
        
        if (sessionId) {
          const context = await ContextManager.getContext(sessionId);
          contextPrompt = ContextManager.buildContextPrompt(context);
          contextData = {
            sessionId,
            patientId: context.patientContext,
            documentIds: context.documentContext
          };
          
          console.log(`🧠 Processing with context - Tokens: ${context.totalTokens}, Messages: ${context.recentMessages.length}`);
        }
        
        // Check if this looks like a search query and handle it specially
        if (isSearchQuery(query)) {
          return await handleSearchQuery(query, mcpManager, sessionId);
        }
        
        // Check if asking about documents/patients
        if (isDocumentQuery(query)) {
          return await handleDocumentQuery(query, mcpManager, sessionId);
        }
        
        // Build enhanced query with context
        let enhancedQuery = query;
        if (contextPrompt && sessionId) {
          const context = await ContextManager.getContext(sessionId);
          if (context.recentMessages.length > 1) {
            enhancedQuery = `${contextPrompt}\n\nCurrent Query: ${query}`;
          }
        }
        
        // Otherwise use regular LLM processing with enhanced medical context
        const response = await mcpManager.processQueryWithMedicalContext(enhancedQuery, contextData);
        
        // Extract and update context
        if (sessionId) {
          await extractAndUpdateContext(query, response, sessionId);
        }
        
        return response;
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
        mcpManager.switchProvider(provider);
        return `Switched to ${provider.toUpperCase()} provider`;
      } catch (error) {
        console.error('Provider switch error:', error);
        throw new Meteor.Error('switch-failed', `Failed to switch provider: ${error.message}`);
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
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return [];
      }
      
      return mcpManager.getAvailableProviders();
    }
    
    // Fallback for simulation
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    
    const providers = [];
    if (anthropicKey) providers.push('anthropic');
    if (ozwellKey) providers.push('ozwell');
    
    return providers;
  },

  // Medical document methods with improved error handling
  async 'medical.uploadDocument'(fileData: {
    filename: string;
    content: string; // Base64
    mimeType: string;
    patientName?: string;
    sessionId?: string;
  }) {
    check(fileData, {
      filename: String,
      content: String,
      mimeType: String,
      patientName: Match.Maybe(String),
      sessionId: Match.Maybe(String)
    });

    console.log(`📤 Uploading document: ${fileData.filename} (${fileData.mimeType})`);

    if (this.isSimulation) {
      console.log('🔄 Simulation mode - returning mock document ID');
      return { 
        success: true, 
        documentId: 'sim-' + Date.now(),
        message: 'Document uploaded (simulation mode)'
      };
    }

    const mcpManager = MCPClientManager.getInstance();
    
    if (!mcpManager.isReady()) {
      throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready. Please check server configuration.');
    }

    try {
      // Check if medical operations are available
      const medical = mcpManager.getMedicalOperations();
      
      console.log('🔧 Using medical operations to upload document...');
      
      const result = await medical.uploadDocument(
        Buffer.from(fileData.content, 'base64'),
        fileData.filename,
        fileData.mimeType,
        {
          patientName: fileData.patientName,
          sessionId: fileData.sessionId || this.connection?.id || 'default',
          uploadedBy: this.userId || 'anonymous',
          uploadDate: new Date()
        }
      );
      
      console.log('✅ Document uploaded successfully:', result);
      
      // Update session with document ID if sessionId provided
      if (fileData.sessionId && result.documentId) {
        await SessionsCollection.updateAsync(fileData.sessionId, {
          $addToSet: {
            'metadata.documentIds': result.documentId
          },
          $set: {
            'metadata.patientId': fileData.patientName || 'Unknown Patient'
          }
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Document upload error:', error);
      
      if (error.message && error.message.includes('Medical MCP server not connected')) {
        throw new Meteor.Error('medical-server-offline', 'Medical document server is not available. Please contact administrator.');
      }
      
      throw new Meteor.Error('upload-failed', `Failed to upload document: ${error.message || 'Unknown error'}`);
    }
  },

  async 'medical.processDocument'(documentId: string, sessionId?: string) {
    check(documentId, String);
    check(sessionId, Match.Maybe(String));
    
    console.log(`🔄 Processing document: ${documentId}`);
    
    if (this.isSimulation) {
      console.log('🔄 Simulation mode - returning mock processing result');
      return { 
        textExtraction: { 
          success: true, 
          extractedText: 'Sample medical text extracted from document',
          confidence: 95
        }, 
        medicalEntities: { 
          success: true,
          entities: [
            { text: 'Diabetes', label: 'CONDITION', confidence: 0.9 },
            { text: 'Metformin', label: 'MEDICATION', confidence: 0.85 }
          ]
        }
      };
    }
    
    const mcpManager = MCPClientManager.getInstance();
    
    if (!mcpManager.isReady()) {
      throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
    }
    
    try {
      const medical = mcpManager.getMedicalOperations();
      
      console.log('🧾 Extracting text from document...');
      // Extract text
      const textResult = await medical.extractText(documentId);
      console.log('📝 Text extraction result:', textResult.success ? 'Success' : 'Failed');
      
      console.log('🏷️ Extracting medical entities...');
      // Extract medical entities
      const entitiesResult = await medical.extractMedicalEntities(documentId);
      console.log('🏷️ Entity extraction result:', entitiesResult.success ? 'Success' : 'Failed');
      
      const result = {
        textExtraction: textResult,
        medicalEntities: entitiesResult
      };
      
      console.log('✅ Document processing completed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ Document processing error:', error);
      throw new Meteor.Error('processing-failed', `Failed to process document: ${error.message || 'Unknown error'}`);
    }
  },

  async 'medical.searchDiagnosis'(patientIdentifier: string, diagnosisQuery?: string, sessionId?: string) {
    check(patientIdentifier, String);
    check(diagnosisQuery, Match.Maybe(String));
    check(sessionId, Match.Maybe(String));
    
    if (this.isSimulation) {
      return { results: [] };
    }
    
    const mcpManager = MCPClientManager.getInstance();
    
    try {
      const medical = mcpManager.getMedicalOperations();
      return await medical.searchByDiagnosis(patientIdentifier, diagnosisQuery, sessionId || 'default');
    } catch (error) {
      console.error('Diagnosis search error:', error);
      throw new Meteor.Error('search-failed', 'Failed to search diagnoses');
    }
  },

  async 'medical.getPatientSummary'(patientIdentifier: string) {
    check(patientIdentifier, String);
    
    if (this.isSimulation) {
      return { patient: patientIdentifier, totalDocuments: 0 };
    }
    
    const mcpManager = MCPClientManager.getInstance();
    
    try {
      const medical = mcpManager.getMedicalOperations();
      return await medical.getPatientSummary(patientIdentifier);
    } catch (error) {
      console.error('Patient summary error:', error);
      throw new Meteor.Error('summary-failed', 'Failed to get patient summary');
    }
  },

  // Test method to check MCP tools availability
  async 'mcp.testConnection'() {
    if (this.isSimulation) {
      return { success: true, tools: ['uploadDocument', 'searchDocuments'], mode: 'simulation' };
    }

    const mcpManager = MCPClientManager.getInstance();
    
    if (!mcpManager.isReady()) {
      return { success: false, error: 'MCP Client not ready', tools: [] };
    }

    try {
      const tools = mcpManager.getAvailableTools();
      const hasMedicalOps = !!mcpManager.getMedicalOperations;
      
      return { 
        success: true, 
        tools: tools.map(t => t.name),
        toolCount: tools.length,
        hasMedicalOperations: hasMedicalOps,
        mode: 'live'
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        tools: [],
        mode: 'error'
      };
    }
  }
});

// Helper function to extract and update context
async function extractAndUpdateContext(
  query: string, 
  response: string, 
  sessionId: string
): Promise<void> {
  // Extract patient name
  const patientMatch = query.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (patientMatch) {
    await SessionsCollection.updateAsync(sessionId, {
      $set: { 'metadata.patientId': patientMatch[1] }
    });
  }
  
  // Extract medical terms from response
  const medicalTerms = extractMedicalTermsFromResponse(response);
  if (medicalTerms.length > 0) {
    await SessionsCollection.updateAsync(sessionId, {
      $addToSet: {
        'metadata.tags': { $each: medicalTerms }
      }
    });
  }
}

function extractMedicalTermsFromResponse(response: string): string[] {
  const medicalPatterns = [
    /\b(?:diagnosed with|diagnosis of)\s+([^,.]+)/gi,
    /\b(?:prescribed|medication)\s+([^,.]+)/gi,
    /\b(?:treatment for|treating)\s+([^,.]+)/gi
  ];
  
  const terms = new Set<string>();
  
  medicalPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      if (match[1]) {
        terms.add(match[1].trim().toLowerCase());
      }
    }
  });
  
  return Array.from(terms).slice(0, 10);
}