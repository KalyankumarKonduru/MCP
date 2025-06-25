import yaml from 'js-yaml';

interface Integration {
  name: string;
}

interface Manifest {
  chat_manifest?: {
    version?: string;
    description?: string;
  };
  integrations?: Integration[];
}

export class IntegrationManager {
  public integrations: string[] = [];

  async loadManifests(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Failed to load integration file');
        return;
      }

      const fileContents = await response.text();
      const manifest = yaml.load(fileContents) as Manifest;

      if (!manifest.chat_manifest || !Array.isArray(manifest.integrations)) {
        console.warn('Invalid manifest file structure');
        return;
      }

      this.integrations = manifest.integrations
        .map((i) => i.name)
        .filter(Boolean);

      console.log('Loaded integrations:', this.integrations);
    } catch (error) {
      console.error('Error loading manifest:', error);
    }
  }

  getIntegrations(): string[] {
    return this.integrations;
  }
}