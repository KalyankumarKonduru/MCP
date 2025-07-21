import { Meteor } from 'meteor/meteor';

interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id: string | number;
}

interface MCPResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  id: string | number;
}

export class MedicalServerConnection {
  private baseUrl: string;
  private sessionId: string | null = null;
  private isInitialized = false;
  private requestId = 1;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async connect(): Promise<void> {
    try {
      console.log(` Connecting to Medical MCP Server at: ${this.baseUrl}`);
      
      // Test if server is running
      const healthCheck = await this.checkServerHealth();
      if (!healthCheck.ok) {
        throw new Error(`MCP Server not responding at ${this.baseUrl}. Please ensure it's running in HTTP mode.`);
      }

      // Initialize the connection with proper MCP protocol using Streamable HTTP
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: false
          }
        },
        clientInfo: {
          name: 'meteor-medical-client',
          version: '1.0.0'
        }
      });

      console.log(' MCP Initialize result:', initResult);

      // Send initialized notification
      await this.sendNotification('initialized', {});

      // Test by listing tools
      const toolsResult = await this.sendRequest('tools/list', {});
      console.log(`MCP Streamable HTTP Connection successful! Found ${toolsResult.tools?.length || 0} tools`);
      
      if (toolsResult.tools) {
        console.log(' Available tools:');
        toolsResult.tools.forEach((tool: any, index: number) => {
          console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
        });
      }

      this.isInitialized = true;
      
    } catch (error) {
      console.error(' Failed to connect to MCP Server via Streamable HTTP:', error);
      throw error;
    }
  }

  private async checkServerHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
        const health = await response.json();
        console.log(' MCP Server health check passed:', health);
        return { ok: true };
      } else {
        return { ok: false, error: `Server returned ${response.status}` };
      }
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.baseUrl) {
      throw new Error('MCP Server not connected');
    }

    const id = this.requestId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream', // Streamable HTTP: Must accept both JSON and SSE
      };

      // Add session ID if we have one (Streamable HTTP session management)
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      console.log(` Sending Streamable HTTP request: ${method}`, { id, sessionId: this.sessionId });

      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      // Extract session ID from response headers if present (Streamable HTTP session management)
      const responseSessionId = response.headers.get('mcp-session-id');
      if (responseSessionId && !this.sessionId) {
        this.sessionId = responseSessionId;
        console.log(' Received session ID:', this.sessionId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }

      // Check content type - Streamable HTTP should return JSON for most responses
      const contentType = response.headers.get('content-type');
      
      // Handle SSE upgrade (optional in Streamable HTTP for streaming responses)
      if (contentType && contentType.includes('text/event-stream')) {
        console.log(' Server upgraded to SSE for streaming response');
        return await this.handleStreamingResponse(response);
      }

      // Standard JSON response
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error(' Unexpected content type:', contentType);
        console.error(' Response text:', responseText.substring(0, 200));
        throw new Error(`Expected JSON response but got ${contentType}`);
      }

      const result: MCPResponse = await response.json();

      if (result.error) {
        throw new Error(`MCP error ${result.error.code}: ${result.error.message}`);
      }

      console.log(` Streamable HTTP request ${method} successful`);
      return result.result;
      
    } catch (error: any) {
      console.error(` Streamable HTTP request failed for method ${method}:`, error);
      throw error;
    }
  }

  private async handleStreamingResponse(response: Response): Promise<any> {
    // Handle SSE streaming response (optional part of Streamable HTTP)
    return new Promise((resolve, reject) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: any = null;

      const processChunk = async () => {
        try {
          const { done, value } = await reader!.read();
          
          if (done) {
            if (result) {
              resolve(result);
            } else {
              reject(new Error('No result received from streaming response'));
            }
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = line.slice(6); // Remove 'data: ' prefix
                if (data === '[DONE]') {
                  resolve(result);
                  return;
                }
                
                const parsed = JSON.parse(data);
                if (parsed.result) {
                  result = parsed.result;
                } else if (parsed.error) {
                  reject(new Error(parsed.error.message));
                  return;
                }
              } catch (e) {
                // Skip invalid JSON lines
                console.warn('Failed to parse SSE data:', data);
              }
            }
          }

          // Continue reading
          processChunk();
        } catch (error) {
          reject(error);
        }
      };

      processChunk();

      // Timeout for streaming responses
      setTimeout(() => {
        reader?.cancel();
        reject(new Error('Streaming response timeout'));
      }, 60000); // 60 second timeout for streaming
    });
  }

  private async sendNotification(method: string, params: any): Promise<void> {
    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        console.warn(`Notification ${method} failed: ${response.status}`);
      }
    } catch (error) {
      console.warn(`Notification ${method} failed:`, error);
    }
  }

  async listTools(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('MCP Server not initialized');
    }

    return this.sendRequest('tools/list', {});
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('MCP Server not initialized');
    }

    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  disconnect() {
    // For Streamable HTTP, we can optionally send a DELETE request to clean up the session
    if (this.sessionId) {
      try {
        fetch(`${this.baseUrl}/mcp`, {
          method: 'DELETE',
          headers: {
            'mcp-session-id': this.sessionId,
            'Content-Type': 'application/json'
          }
        }).catch(() => {
          // Ignore errors on disconnect
        });
      } catch (error) {
        // Ignore errors on disconnect
      }
    }
    
    this.sessionId = null;
    this.isInitialized = false;
    console.log('📋 Disconnected from MCP Server');
  }
}

// Medical operations implementation for Streamable HTTP transport
export interface MedicalDocumentOperations {
  uploadDocument(file: Buffer, filename: string, mimeType: string, metadata: any): Promise<any>;
  searchDocuments(query: string, options?: any): Promise<any>;
  listDocuments(options?: any): Promise<any>;
  extractMedicalEntities(text: string, documentId?: string): Promise<any>;
  findSimilarCases(criteria: any): Promise<any>;
  analyzePatientHistory(patientId: string, options?: any): Promise<any>;
  getMedicalInsights(query: string, context?: any): Promise<any>;
  
  // Legacy methods for backward compatibility
  extractText(documentId: string): Promise<any>;
  searchByDiagnosis(patientIdentifier: string, diagnosisQuery?: string, sessionId?: string): Promise<any>;
  semanticSearch(query: string, patientId?: string): Promise<any>;
  getPatientSummary(patientIdentifier: string): Promise<any>;
}

export function createMedicalOperations(connection: MedicalServerConnection): MedicalDocumentOperations {
  return {
    // New tool methods using the exact tool names from your server
    async uploadDocument(file: Buffer, filename: string, mimeType: string, metadata: any) {
      const result = await connection.callTool('uploadDocument', {
        title: filename,
        fileBuffer: file.toString('base64'),
        metadata: {
          ...metadata,
          fileType: mimeType.split('/')[1] || 'unknown',
          size: file.length
        }
      });
      
      // Parse the result if it's in the content array format
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async searchDocuments(query: string, options: any = {}) {
      const result = await connection.callTool('searchDocuments', {
        query,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
        filter: options.filter || {}
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async listDocuments(options: any = {}) {
      const result = await connection.callTool('listDocuments', {
        limit: options.limit || 20,
        offset: options.offset || 0,
        filter: options.filter || {}
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async extractMedicalEntities(text: string, documentId?: string) {
      const result = await connection.callTool('extractMedicalEntities', {
        text,
        documentId
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async findSimilarCases(criteria: any) {
      const result = await connection.callTool('findSimilarCases', criteria);
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async analyzePatientHistory(patientId: string, options: any = {}) {
      const result = await connection.callTool('analyzePatientHistory', {
        patientId,
        analysisType: options.analysisType || 'summary',
        dateRange: options.dateRange
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    async getMedicalInsights(query: string, context: any = {}) {
      const result = await connection.callTool('getMedicalInsights', {
        query,
        context,
        limit: context.limit || 5
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          return JSON.parse(result.content[0].text);
        } catch (e) {
          return result;
        }
      }
      return result;
    },

    // Legacy compatibility methods
    async extractText(documentId: string) {
      // This might not exist as a separate tool, try to get document content
      const result = await connection.callTool('listDocuments', {
        filter: { _id: documentId },
        limit: 1
      });
      
      if (result.content && result.content[0] && result.content[0].text) {
        try {
          const parsed = JSON.parse(result.content[0].text);
          if (parsed.documents && parsed.documents[0]) {
            return {
              success: true,
              extractedText: parsed.documents[0].content,
              confidence: 100
            };
          }
        } catch (e) {
          // fallback
        }
      }
      
      throw new Error('Text extraction not supported - use document content from upload result');
    },

    async searchByDiagnosis(patientIdentifier: string, diagnosisQuery?: string, sessionId?: string) {
      return await this.searchDocuments(diagnosisQuery || patientIdentifier, {
        filter: { patientId: patientIdentifier },
        limit: 10
      });
    },

    async semanticSearch(query: string, patientId?: string) {
      return await this.searchDocuments(query, {
        filter: patientId ? { patientId } : {},
        limit: 5
      });
    },

    async getPatientSummary(patientIdentifier: string) {
      return await this.analyzePatientHistory(patientIdentifier, {
        analysisType: 'summary'
      });
    }
  };
}