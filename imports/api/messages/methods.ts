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

  // Medical document methods with improved error handling
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
      const sessionId = this.connection?.id || 'default';
      
      console.log('🔧 Using medical operations to upload document...');
      
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
      
      console.log('✅ Document uploaded successfully:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Document upload error:', error);
      
      if (error.message && error.message.includes('Medical MCP server not connected')) {
        throw new Meteor.Error('medical-server-offline', 'Medical document server is not available. Please contact administrator.');
      }
      
      throw new Meteor.Error('upload-failed', `Failed to upload document: ${error.message || 'Unknown error'}`);
    }
  },

  async 'medical.processDocument'(documentId: string) {
    check(documentId, String);
    
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