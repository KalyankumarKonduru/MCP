import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';
import { ProviderSwitcher } from './ProviderSwitcher';
import { Sidebar } from './Sidebar';
import { Menu, Plus, Download, Upload } from 'lucide-react';
import { Meteor } from 'meteor/meteor';

interface HeaderProps {
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  currentSessionId?: string;
}

export const Header: React.FC<HeaderProps> = ({ 
  onNewChat, 
  onSelectChat, 
  onDeleteChat,
  currentSessionId 
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!currentSessionId || isExporting) return;
    
    setIsExporting(true);
    try {
      const exportData = await Meteor.callAsync('sessions.export', currentSessionId);
      
      // Create and download JSON file
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
        
        // Validate the data structure
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

  return (
    <>
      <header className="header">
        <div className="flex items-center space-x-1 sm:space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            title="Open chat history"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">MCP Chat</h1>
          
          {/* Quick new chat button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onNewChat}
            title="Start new chat"
            className="hidden sm:flex"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Export/Import buttons */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!currentSessionId || isExporting}
              title="Export current chat"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImport}
              title="Import chat"
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
          
          <ProviderSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={onNewChat}
        onSelectChat={onSelectChat}
        onDeleteChat={onDeleteChat}
        currentSessionId={currentSessionId}
      />
    </>
  );
};