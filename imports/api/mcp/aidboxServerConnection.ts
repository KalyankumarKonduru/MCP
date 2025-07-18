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

export class AidboxServerConnection {
  private baseUrl: string;
  private sessionId: string | null = null;
  private isInitialized = false;
  private requestId = 1;

  constructor(baseUrl: string = 'http://localhost:3002') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async connect(): Promise<void> {
    try {
      console.log(`🏥 Connecting to Aidbox MCP Server at: ${this.baseUrl}`);
      
      // Test if server is running
      const healthCheck = await this.checkServerHealth();
      if (!healthCheck.ok) {
        throw new Error(`Aidbox MCP Server not responding at ${this.baseUrl}`);
      }

      // Initialize the connection
      const initResult = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: false
          }
        },
        clientInfo: {
          name: 'meteor-aidbox-client',
          version: '1.0.0'
        }
      });

      console.log('🏥 Aidbox MCP Initialize result:', initResult);

      // Send initialized notification
      await this.sendNotification('initialized', {});

      // Test by listing tools
      const toolsResult = await this.sendRequest('tools/list', {});
      console.log(`✅ Aidbox MCP Connection successful! Found ${toolsResult.tools?.length || 0} tools`);
      
      if (toolsResult.tools) {
        console.log('🏥 Available Aidbox tools:');
        toolsResult.tools.forEach((tool: any, index: number) => {
          console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
        });
      }

      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ Failed to connect to Aidbox MCP Server:', error);
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
        console.log('✅ Aidbox MCP Server health check passed:', health);
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
      throw new Error('Aidbox MCP Server not connected');
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
        'Accept': 'application/json',
      };

      // Add session ID if we have one
      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      console.log(`🔄 Sending request to Aidbox: ${method}`, { id, sessionId: this.sessionId });

      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      // Extract session ID from response headers if present
      const responseSessionId = response.headers.get('mcp-session-id');
      if (responseSessionId && !this.sessionId) {
        this.sessionId = responseSessionId;
        console.log('🏥 Received Aidbox session ID:', this.sessionId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }

      const result: MCPResponse = await response.json();

      if (result.error) {
        throw new Error(`Aidbox MCP error ${result.error.code}: ${result.error.message}`);
      }

      console.log(`✅ Aidbox request ${method} successful`);
      return result.result;
      
    } catch (error: any) {
      console.error(`❌ Aidbox request failed for method ${method}:`, error);
      throw error;
    }
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
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.warn(`Notification ${method} failed:`, error);
    }
  }

  async listTools(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Aidbox MCP Server not initialized');
    }

    return this.sendRequest('tools/list', {});
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Aidbox MCP Server not initialized');
    }

    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  disconnect() {
    this.sessionId = null;
    this.isInitialized = false;
    console.log('🏥 Disconnected from Aidbox MCP Server');
  }
}

// Aidbox FHIR operations
export interface AidboxFHIROperations {
  searchPatients(query: any): Promise<any>;
  getPatientDetails(patientId: string): Promise<any>;
  createPatient(patientData: any): Promise<any>;
  updatePatient(patientId: string, updates: any): Promise<any>;
  getPatientObservations(patientId: string, options?: any): Promise<any>;
  createObservation(observationData: any): Promise<any>;
  getPatientMedications(patientId: string, options?: any): Promise<any>;
  createMedicationRequest(medicationData: any): Promise<any>;
  getPatientConditions(patientId: string, options?: any): Promise<any>;
  createCondition(conditionData: any): Promise<any>;
  getPatientEncounters(patientId: string, options?: any): Promise<any>;
  createEncounter(encounterData: any): Promise<any>;
}

export function createAidboxOperations(connection: AidboxServerConnection): AidboxFHIROperations {
  return {
    async searchPatients(query: any) {
      const result = await connection.callTool('aidboxSearchPatients', query);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async getPatientDetails(patientId: string) {
      const result = await connection.callTool('aidboxGetPatientDetails', { patientId });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async createPatient(patientData: any) {
      const result = await connection.callTool('aidboxCreatePatient', patientData);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async updatePatient(patientId: string, updates: any) {
      const result = await connection.callTool('aidboxUpdatePatient', { patientId, ...updates });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async getPatientObservations(patientId: string, options: any = {}) {
      const result = await connection.callTool('aidboxGetPatientObservations', { patientId, ...options });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async createObservation(observationData: any) {
      const result = await connection.callTool('aidboxCreateObservation', observationData);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async getPatientMedications(patientId: string, options: any = {}) {
      const result = await connection.callTool('aidboxGetPatientMedications', { patientId, ...options });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async createMedicationRequest(medicationData: any) {
      const result = await connection.callTool('aidboxCreateMedicationRequest', medicationData);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async getPatientConditions(patientId: string, options: any = {}) {
      const result = await connection.callTool('aidboxGetPatientConditions', { patientId, ...options });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async createCondition(conditionData: any) {
      const result = await connection.callTool('aidboxCreateCondition', conditionData);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async getPatientEncounters(patientId: string, options: any = {}) {
      const result = await connection.callTool('aidboxGetPatientEncounters', { patientId, ...options });
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    },

    async createEncounter(encounterData: any) {
      const result = await connection.callTool('aidboxCreateEncounter', encounterData);
      return result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result;
    }
  };
}