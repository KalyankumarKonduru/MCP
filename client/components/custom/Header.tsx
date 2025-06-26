import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { ProviderSwitcher } from './ProviderSwitcher';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

export const Header: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="header">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">MCP Chat</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <ProviderSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </>
  );
};