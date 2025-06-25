import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

export const Header: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-background border-b w-full">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">MCP Pilot</h1>
        </div>
        <ThemeToggle />
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </>
  );
};