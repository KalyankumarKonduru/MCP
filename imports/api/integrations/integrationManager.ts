import yaml from 'js-yaml';

interface Integration {
  name: string;
  version?: string; // Added optional version field
  enabled?: boolean; // Added optional enabled field
}

interface Manifest {
  chat_manifest?: {
    version?: string;
    description?: string;
    lastUpdated?: string; // Added optional lastUpdated field
  };
  integrations?: Integration[];
}

export class IntegrationManager {
  public integrations: string[] = [];
  private loadAttempts: number = 0; // Track load attempts for monitoring

  async loadManifests(url: string): Promise<void> {
    this.loadAttempts++;
    const startTime = Date.now(); // Track loading performance
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to load integration file: ${response.status} ${response.statusText}`);
        return;
      }

      const fileContents = await response.text();
      
      // Add validation for empty response
      if (!fileContents || fileContents.trim().length === 0) {
        console.warn('Empty manifest file received');
        return;
      }
      
      const manifest = yaml.load(fileContents) as Manifest;

      if (!manifest.chat_manifest || !Array.isArray(manifest.integrations)) {
        console.warn('Invalid manifest file structure - missing required fields');
        return;
      }

      // Enhanced filtering with null/undefined checks
      this.integrations = manifest.integrations
        .filter((i) => i && typeof i.name === 'string' && i.name.trim().length > 0)
        .map((i) => i.name.trim());

      const loadTime = Date.now() - startTime;
      console.log(`Loaded ${this.integrations.length} integrations in ${loadTime}ms (attempt #${this.loadAttempts})`);
      
    } catch (error) {
      console.error('Error loading manifest:', error);
      // Log more specific error details
      if (error instanceof yaml.YAMLException) {
        console.error('YAML parsing error:', error.message);
      }
    }
  }

  getIntegrations(): string[] {
    return [...this.integrations]; // Return a copy to prevent external modifications
  }
  
  // New method to check if integrations are loaded
  hasIntegrations(): boolean {
    return this.integrations.length > 0;
  }
  
  // New method to get load statistics
  getLoadStatistics(): { attempts: number; count: number } {
    return {
      attempts: this.loadAttempts,
      count: this.integrations.length
    };
  }
}