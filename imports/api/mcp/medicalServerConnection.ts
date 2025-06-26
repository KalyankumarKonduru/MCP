import { spawn, ChildProcess } from 'child_process';
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
  private process: ChildProcess | null = null;
  private messageBuffer: string = '';
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = new Map();
  private isInitialized = false;
  private requestId = 1;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Get server path from settings or use default
        const serverPath = Meteor.settings?.private?.MEDICAL_MCP_SERVER_PATH || 
                          '/Users/kalyankumarkonduru/MCP-Server/dist/index.js';
        
        console.log(`📄 Attempting to connect to Medical MCP Server at: ${serverPath}`);
        
        // Spawn the MCP server process with stdio mode
        this.process = spawn('node', [serverPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            MCP_STDIO_MODE: 'true'
          }
        });

        // Handle stdout (JSON-RPC responses from server)
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleServerData(data.toString());
        });

        // Handle stderr (server logs - don't try to parse as JSON)
        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            console.log(`MCP Server Log: ${message}`);
          }
        });

        // Handle process exit
        this.process.on('exit', (code) => {
          console.log(`MCP Server exited with code ${code}`);
          this.cleanup();
        });

        // Handle process errors
        this.process.on('error', (error) => {
          console.error('MCP Server process error:', error);
          reject(error);
        });

        // Initialize the connection with proper MCP protocol
        setTimeout(async () => {
          try {
            await this.sendRequest('initialize', {
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

            // Send initialized notification
            await this.sendNotification('initialized', {});

            this.isInitialized = true;
            console.log('✅ Connected to Medical Document MCP Server via stdio');
            console.log('🏥 Medical document processing features are now available');
            resolve();
          } catch (error) {
            console.error('Failed to initialize MCP connection:', error);
            reject(error);
          }
        }, 1000); // Give server time to start

      } catch (error) {
        console.error('Failed to start MCP server:', error);
        reject(error);
      }
    });
  }

  private handleServerData(data: string) {
    this.messageBuffer += data;
    
    // Split by newlines to handle multiple messages
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        try {
          const response: MCPResponse = JSON.parse(trimmedLine);
          this.handleResponse(response);
        } catch (error) {
          // Skip non-JSON lines (server logs)
          console.log('Server output:', trimmedLine);
        }
      }
    }
  }

  private handleResponse(response: MCPResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
      this.pendingRequests.delete(response.id);
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('MCP Server not connected'));
        return;
      }

      const id = this.requestId++;
      const request: MCPRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };

      this.pendingRequests.set(id, { resolve, reject });
      
      // Send request to server
      const requestStr = JSON.stringify(request) + '\n';
      this.process.stdin.write(requestStr);

      // Set timeout for requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 30000); // 30 second timeout
    });
  }

  private sendNotification(method: string, params: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('MCP Server not connected'));
        return;
      }

      const notification = {
        jsonrpc: '2.0',
        method,
        params
      };

      const notificationStr = JSON.stringify(notification) + '\n';
      this.process.stdin.write(notificationStr);
      resolve();
    });
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
    this.cleanup();
  }

  private cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pendingRequests.clear();
    this.isInitialized = false;
  }
}

// Medical operations implementation with correct tool names
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
    // New tool methods
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
      return JSON.parse(result.content[0].text);
    },

    async searchDocuments(query: string, options: any = {}) {
      const result = await connection.callTool('searchDocuments', {
        query,
        limit: options.limit || 10,
        threshold: options.threshold || 0.7,
        filter: options.filter || {}
      });
      return JSON.parse(result.content[0].text);
    },

    async listDocuments(options: any = {}) {
      const result = await connection.callTool('listDocuments', {
        limit: options.limit || 20,
        offset: options.offset || 0,
        filter: options.filter || {}
      });
      return JSON.parse(result.content[0].text);
    },

    async extractMedicalEntities(text: string, documentId?: string) {
      const result = await connection.callTool('extractMedicalEntities', {
        text,
        documentId
      });
      return JSON.parse(result.content[0].text);
    },

    async findSimilarCases(criteria: any) {
      const result = await connection.callTool('findSimilarCases', criteria);
      return JSON.parse(result.content[0].text);
    },

    async analyzePatientHistory(patientId: string, options: any = {}) {
      const result = await connection.callTool('analyzePatientHistory', {
        patientId,
        analysisType: options.analysisType || 'summary',
        dateRange: options.dateRange
      });
      return JSON.parse(result.content[0].text);
    },

    async getMedicalInsights(query: string, context: any = {}) {
      const result = await connection.callTool('getMedicalInsights', {
        query,
        context,
        limit: context.limit || 5
      });
      return JSON.parse(result.content[0].text);
    },

    // Legacy compatibility methods
    async extractText(documentId: string) {
      const result = await connection.callTool('extract_text', { documentId });
      return JSON.parse(result.content[0].text);
    },

    async searchByDiagnosis(patientIdentifier: string, diagnosisQuery?: string, sessionId?: string) {
      const result = await connection.callTool('search_by_diagnosis', {
        patientIdentifier,
        diagnosisQuery,
        sessionId
      });
      return JSON.parse(result.content[0].text);
    },

    async semanticSearch(query: string, patientId?: string) {
      const result = await connection.callTool('semantic_search', {
        query,
        patientId,
        limit: 5
      });
      return JSON.parse(result.content[0].text);
    },

    async getPatientSummary(patientIdentifier: string) {
      const result = await connection.callTool('get_patient_summary', {
        patientIdentifier,
        summaryType: 'detailed'
      });
      return JSON.parse(result.content[0].text);
    }
  };
}

