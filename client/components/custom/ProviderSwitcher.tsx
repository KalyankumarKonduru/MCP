import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { Button } from '../ui/Button';
import { ChevronDown } from 'lucide-react';
import { cn } from '/imports/lib/utils';

export const ProviderSwitcher: React.FC = () => {
  const [currentProvider, setCurrentProvider] = useState<'anthropic' | 'ozwell' | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Get current provider and available providers
    const loadProviderInfo = async () => {
      try {
        const current = await Meteor.callAsync('mcp.getCurrentProvider');
        const available = await Meteor.callAsync('mcp.getAvailableProviders');
        
        setCurrentProvider(current);
        setAvailableProviders(available);
      } catch (error) {
        console.error('Error loading provider info:', error);
      }
    };

    loadProviderInfo();
  }, []);

  const handleProviderSwitch = async (provider: 'anthropic' | 'ozwell') => {
    if (provider === currentProvider || isLoading) return;

    setIsLoading(true);
    try {
      await Meteor.callAsync('mcp.switchProvider', provider);
      setCurrentProvider(provider);
      setIsOpen(false);
      
      // Show success message
      console.log(`Switched to ${provider.toUpperCase()}`);
    } catch (error) {
      console.error('Error switching provider:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (availableProviders.length <= 1) {
    return null; // Don't show if only one provider available
  }

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case 'anthropic': return 'Claude';
      case 'ozwell': return 'Ozwell';
      default: return provider;
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'anthropic': return '🤖';
      case 'ozwell': return '🌟';
      default: return '🔮';
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 min-w-[120px]"
      >
        <span>{getProviderIcon(currentProvider || '')}</span>
        <span>{getProviderDisplayName(currentProvider || '')}</span>
        <ChevronDown className={cn(
          "h-3 w-3 transition-transform",
          isOpen && "transform rotate-180"
        )} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-background border rounded-md shadow-lg z-50">
          {availableProviders.map((provider) => (
            <button
              key={provider}
              onClick={() => handleProviderSwitch(provider as 'anthropic' | 'ozwell')}
              disabled={provider === currentProvider || isLoading}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground transition-colors",
                provider === currentProvider && "bg-accent text-accent-foreground"
              )}
            >
              <span>{getProviderIcon(provider)}</span>
              <span>{getProviderDisplayName(provider)}</span>
              {provider === currentProvider && (
                <span className="ml-auto text-xs text-muted-foreground">Current</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Overlay to close dropdown */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};