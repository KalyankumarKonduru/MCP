import React from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { Chat } from './Chat';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background">
        <Chat />
      </div>
    </ThemeProvider>
  );
};