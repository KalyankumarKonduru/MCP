import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { ProviderSwitcher } from './ProviderSwitcher';
import { 
  Menu, 
  Plus, 
  Download, 
  Upload, 
  Settings
} from 'lucide-react';
import { Meteor } from 'meteor/meteor';

interface HeaderProps {
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  currentSessionId?: string;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onNewChat, 
  onSelectChat, 
  onDeleteChat,
  currentSessionId,
  sidebarOpen,
  onToggleSidebar
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleExport = async () => {
    if (!currentSessionId || isExporting) return;
    
    setIsExporting(true);
    try {
      const exportData = await Meteor.callAsync('sessions.export', currentSessionId);
      
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export chat. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.session || !data.messages || !data.version) {
          throw new Error('Invalid chat export file');
        }
        
        const newSessionId = await Meteor.callAsync('sessions.import', data);
        onSelectChat?.(newSessionId);
        
        alert('Chat imported successfully!');
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import chat. Please check the file format.');
      }
    };
    
    input.click();
  };

  const handleNewChat = () => {
    onNewChat?.();
    setShowMenu(false);
  };

  return (
    <header className="header">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleSidebar}
          title="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>
        
        <h1 className="text-lg font-semibold">MCP Chat</h1>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Desktop menu items */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!currentSessionId || isExporting}
            title="Export current chat"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            title="Import chat"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
        </div>
        
        {/* Mobile menu dropdown */}
        <div className="md:hidden relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMenu(!showMenu)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          
          {showMenu && (
            <>
              <div 
                className="sidebar-overlay active"
                onClick={() => setShowMenu(false)}
              />
              <div className="provider-dropdown">
                <button
                  className="provider-option"
                  onClick={handleExport}
                  disabled={!currentSessionId || isExporting}
                >
                  <Download className="h-4 w-4" />
                  Export chat
                </button>
                <button
                  className="provider-option"
                  onClick={handleImport}
                >
                  <Upload className="h-4 w-4" />
                  Import chat
                </button>
              </div>
            </>
          )}
        </div>
        
        <ProviderSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
};