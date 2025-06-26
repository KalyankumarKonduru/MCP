import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { MessagesCollection, Message } from './messages';
import { MCPClientManager } from '/imports/api/mcp/mcpClientManager';

Meteor.methods({
  async 'messages.insert'(messageData: Omit<Message, '_id'>) {
    check(messageData, {
      content: String,
      role: String,
      timestamp: Date,
      sessionId: String
    });

    return await MessagesCollection.insertAsync(messageData);
  },

  async 'mcp.processQuery'(query: string) {
    check(query, String);
    
    if (!this.isSimulation) {
      const mcpManager = MCPClientManager.getInstance();
      
      if (!mcpManager.isReady()) {
        return 'MCP Client is not ready. Please check your API configuration.';
      }
      
      try {
        const sessionId = this.connection?.id || 'default';
        return await mcpManager.processQueryWithMedicalContext(query, { sessionId });
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
        await mcpManager.switchProvider(provider);
        return `Switched to ${provider.toUpperCase()} provider`;
      } catch (error) {
        console.error('Provider switch error:', error);
        throw new Meteor.Error('switch-failed', 'Failed to switch provider');
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
    const settings = Meteor.settings?.private;
    const anthropicKey = settings?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    const ozwellKey = settings?.OZWELL_API_KEY || process.env.OZWELL_API_KEY;
    
    const providers = [];
    if (anthropicKey) providers.push('anthropic');
    if (ozwellKey) providers.push('ozwell');
    
    return providers;
  },

  // Medical document methods
  async 'medical.uploadDocument'(fileData: {
    filename: string;
    content: string; // Base64
    mimeType: string;
    patientName?: string;
  }) {
    check(fileData, {
      filename: String,
      content: String,
      mimeType: String,
      patientName: Match.Maybe(String)
    });

    if (this.isSimulation) {
      return { success: true, documentId: 'sim-123' };
    }

    const mcpManager = MCPClientManager.getInstance();
    
    try {
      const medical = mcpManager.getMedicalOperations();
      const sessionId = this.connection?.id || 'default';
      
      const result = await medical.uploadDocument(
        Buffer.from(fileData.content, 'base64'),
        fileData.filename,
        fileData.mimeType,
        {
          patientName: fileData.patientName,
          sessionId,
          uploadedBy: this.userId || 'anonymous',
          uploadDate: new Date()
        }
      );
      
      return result;
    } catch (error) {
      console.error('Document upload error:', error);
      throw new Meteor.Error('upload-failed', 'Failed to upload document. Medical server may be offline.');
    }
  },

  async 'medical.processDocument'(documentId: string) {
    check(documentId, String);
    
    if (this.isSimulation) {
      return { textExtraction: { success: true }, medicalEntities: { success: true } };
    }
    
    const mcpManager = MCPClientManager.getInstance();
    
    try {
      const medical = mcpManager.getMedicalOperations();
      
      // Extract text
      const textResult = await medical.extractText(documentId);
      
      // Extract medical entities
      const entitiesResult = await medical.extractMedicalEntities(documentId);
      
      return {
        textExtraction: textResult,
        medicalEntities: entitiesResult
      };
    } catch (error) {
      console.error('Document processing error:', error);
      throw new Meteor.Error('processing-failed', 'Failed to process document');
    }
  },

  async 'medical.searchDiagnosis'(patientIdentifier: string, diagnosisQuery?: string) {
    check(patientIdentifier, String);
    check(diagnosisQuery, Match.Maybe(String));
    
    if (this.isSimulation) {
      return { results: [] };
    }
    
    const mcpManager = MCPClientManager.getInstance();
    const sessionId = this.connection?.id || 'default';
    
    try {
      const medical = mcpManager.getMedicalOperations();
      return await medical.searchByDiagnosis(patientIdentifier, diagnosisQuery, sessionId);
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
  }
});