// imports/api/messages/methods.ts
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { SessionsCollection } from '../sessions/sessions';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';
import { ContextManager } from '../context/contextManager';

// Meteor Methods
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
        console.log(`🧠 Processing query with intelligent tool selection: "${query}"`);
        
        // Build context for the query
        const context: any = { sessionId };
        
        if (sessionId) {
          // Get session context
          const session = await SessionsCollection.findOneAsync(sessionId);
          if (session?.metadata?.patientId) {
            context.patientId = session.metadata.patientId;
          }
          
          // Get conversation context
          const contextData = await ContextManager.getContext(sessionId);
          context.conversationContext = contextData;
        }
        
        // Let Claude intelligently decide what tools to use
        const response = await mcpManager.processQueryWithIntelligentToolSelection(query, context);
        
        // Update context after processing
        if (sessionId) {
          await extractAndUpdateContext(query, response, sessionId);
        }
        
        return response;
      } catch (error) {
        console.error('Intelligent MCP processing error:', error);
        
        // Provide helpful error messages based on the error type
        if (error.message.includes('not connected')) {
          return 'I\'m having trouble connecting to the medical data systems. Please ensure the MCP servers are running and try again.';
        } else if (error.message.includes('API')) {
          return 'I encountered an API error while processing your request. Please try again in a moment.';
        } else {
          return 'I encountered an error while processing your request. Please try rephrasing your question or contact support if the issue persists.';
        }
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
        await mcpManager.switchProvider(provider);
        return `Switched to ${provider.toUpperCase()} provider with intelligent tool selection`;
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

  'mcp.getAvailableTools'() {
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return [];
      }
      
      return mcpManager.getAvailableTools();
    }
    
    return [];
  },

  // Medical document methods
  async 'medical.uploadDocument'(fileData: {
    filename: string;
    content: string;
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
      const medical = mcpManager.getMedicalOperations();
      
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

    if (this.isSimulation) {
      return {
        success: true,
        message: 'Document processed (simulation mode)',
        textExtraction: { extractedText: 'Sample text', confidence: 95 },
        medicalEntities: { entities: [], summary: { diagnosisCount: 0, medicationCount: 0, labResultCount: 0 } }
      };
    }

    const mcpManager = MCPClientManager.getInstance();
    
    if (!mcpManager.isReady()) {
      throw new Meteor.Error('mcp-not-ready', 'MCP Client is not ready');
    }

    try {
      const medical = mcpManager.getMedicalOperations();
      
      // Process document using intelligent tool selection
      const result = await medical.extractMedicalEntities('', documentId);
      
      return result;
      
    } catch (error) {
      console.error('❌ Document processing error:', error);
      throw new Meteor.Error('processing-failed', `Failed to process document: ${error.message || 'Unknown error'}`);
    }
  }
});

// Helper function to extract and update context
async function extractAndUpdateContext(
  query: string, 
  response: string, 
  sessionId: string
): Promise<void> {
  try {
    // Extract patient name from query
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
    
    // Extract data sources mentioned
    const dataSources = extractDataSources(response);
    if (dataSources.length > 0) {
      await SessionsCollection.updateAsync(sessionId, {
        $addToSet: {
          'metadata.dataSources': { $each: dataSources }
        }
      });
    }
  } catch (error) {
    console.error('Error updating context:', error);
  }
}

function extractMedicalTermsFromResponse(response: string): string[] {
  const medicalPatterns = [
    /\b(?:diagnosed with|diagnosis of)\s+([^,.]+)/gi,
    /\b(?:prescribed|medication)\s+([^,.]+)/gi,
    /\b(?:treatment for|treating)\s+([^,.]+)/gi,
    /\b(?:condition|disease):\s*([^,.]+)/gi
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

function extractDataSources(response: string): string[] {
  const sources = new Set<string>();
  
  if (response.toLowerCase().includes('aidbox') || response.toLowerCase().includes('fhir')) {
    sources.add('Aidbox FHIR');
  }
  
  if (response.toLowerCase().includes('epic') || response.toLowerCase().includes('ehr')) {
    sources.add('Epic EHR');
  }
  
  if (response.toLowerCase().includes('document') || response.toLowerCase().includes('uploaded')) {
    sources.add('Medical Documents');
  }
  
  return Array.from(sources);
}