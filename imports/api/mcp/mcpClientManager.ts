import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface MCPClientConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
}

export class MCPClientManager {
  private static instance: MCPClientManager;
  private anthropic?: Anthropic;
  private openai?: OpenAI;
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
    this.config = config;

    try {
      if (config.provider === 'anthropic') {
        this.anthropic = new Anthropic({
          apiKey: config.apiKey,
        });
      } else {
        this.openai = new OpenAI({
          apiKey: config.apiKey,
        });
      }

      this.isInitialized = true;
      console.log('MCP Client initialized with provider:', config.provider);
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw error;
    }
  }

  public async processQuery(query: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('MCP Client not initialized');
    }

    try {
      if (this.config?.provider === 'anthropic' && this.anthropic) {
        return await this.processWithAnthropic(query);
      } else if (this.openai) {
        return await this.processWithOpenAI(query);
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

  private async processWithOpenAI(query: string): Promise<string> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4',
      max_tokens: 1000,
      messages: [{ role: 'user', content: query }],
    });

    return response.choices[0].message.content || 'No response generated';
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  public getConfig(): MCPClientConfig | undefined {
    return this.config;
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
  }
}