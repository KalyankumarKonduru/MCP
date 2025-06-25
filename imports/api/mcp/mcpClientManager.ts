import Anthropic from '@anthropic-ai/sdk';

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

  private async processWithAnthropic(query: string): Promise<string> {
    const response = await this.anthropic!.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [{ role: 'user', content: query }],
    });

    if (response.content[0].type === 'text') {
      return response.content[0].text;
    }

    return 'No response generated';
  }

  private async processWithOzwell(query: string): Promise<string> {
    const endpoint = this.config?.ozwellEndpoint || 'https://ai.bluehive.com/api/v1/completion';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config?.apiKey}`,
        },
        body: JSON.stringify({
          prompt: query,
          max_tokens: 1000,
          temperature: 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ozwell API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Adjust this based on Ozwell's actual response format
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
    console.log('Shutting down MCP Client...');
    this.isInitialized = false;
  }
}