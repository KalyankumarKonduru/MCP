import React, { useState, useRef, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { useScrollToBottom } from './hooks/useScrollToBottom';
import { MessagesCollection } from '/imports/api/messages/messages';
import { SessionsCollection } from '/imports/api/sessions/sessions';
import { cn } from '/imports/lib/utils';

// Import only the components that definitely exist
import { PreviewMessage, ThinkingMessage } from '/client/components/custom/Message';
import { Overview } from '/client/components/custom/Overview';
import { ChatInput } from '/client/components/custom/ChatInput';

// Simple Header Component - inline to avoid import issues
const SimpleHeader: React.FC<{
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}> = ({ onToggleSidebar, sidebarOpen }) => {
  return (
    <header className="header">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="button button-outline button-sm"
          title="Toggle sidebar"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <h1 className="text-lg font-semibold">MCP Chat</h1>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Add your existing header components here if needed */}
      </div>
    </header>
  );
};

// Simple Sidebar Component - inline to avoid import issues
const SimpleSidebar: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  currentSessionId?: string;
}> = ({ isOpen, onClose, onNewChat, onSelectChat, onDeleteChat, currentSessionId }) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Subscribe to sessions list
  const sessions = useTracker(() => {
    const handle = Meteor.subscribe('sessions.list', 50);
    if (!handle.ready()) return [];
    
    return SessionsCollection.find(
      {},
      { sort: { updatedAt: -1 } }
    ).fetch();
  }, []);

  const handleDeleteChat = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    
    try {
      await onDeleteChat(sessionId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={cn("sidebar", isOpen && "open")}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Chats</h2>
        </div>
        
        <button
          onClick={() => {
            onNewChat();
            onClose();
          }}
          className="button button-primary w-full"
        >
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New chat
        </button>
      </div>

      {/* Sessions List */}
      <div className="sidebar-content">
        {sessions.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session._id}
                className={cn(
                  "sidebar-item",
                  session._id === currentSessionId && "active",
                  deletingId === session._id && "opacity-50"
                )}
                onClick={() => {
                  onSelectChat(session._id!);
                  onClose();
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="sidebar-item-text">
                    {session.title}
                  </div>
                  
                  {session.metadata?.patientId && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Patient: {session.metadata.patientId}
                    </div>
                  )}
                </div>

                <div className="sidebar-item-actions">
                  <button
                    onClick={(e) => handleDeleteChat(e, session._id!)}
                    disabled={deletingId === session._id}
                    className="button button-ghost button-sm"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const Chat: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentPatient, setCurrentPatient] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messagesContainerRef] = useScrollToBottom<HTMLDivElement>();

  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      try {
        const savedSessionId = localStorage.getItem('currentSessionId');
        
        if (savedSessionId) {
          const session = await Meteor.callAsync('sessions.get', savedSessionId).catch(() => null);
          if (session) {
            setSessionId(savedSessionId);
            if (session.metadata?.patientId) {
              setCurrentPatient(session.metadata.patientId);
            }
            return;
          }
        }
        
        const { sessions } = await Meteor.callAsync('sessions.list', 1, 0);
        const activeSession = sessions.find((s: any) => s.isActive);
        
        if (activeSession) {
          setSessionId(activeSession._id);
          localStorage.setItem('currentSessionId', activeSession._id);
          if (activeSession.metadata?.patientId) {
            setCurrentPatient(activeSession.metadata.patientId);
          }
        } else {
          const newSessionId = await Meteor.callAsync('sessions.create');
          setSessionId(newSessionId);
          localStorage.setItem('currentSessionId', newSessionId);
        }
      } catch (error) {
        console.error('Error initializing session:', error);
      }
    };
    
    initSession();
  }, []);

  // Subscribe to messages
  const messages = useTracker(() => {
    if (!sessionId) return [];
    
    const handle = Meteor.subscribe('messages', sessionId);
    if (!handle.ready()) return [];
    
    return MessagesCollection.find(
      { sessionId },
      { sort: { timestamp: 1 } }
    ).fetch();
  }, [sessionId]);

  // Subscribe to current session
  const currentSession = useTracker(() => {
    if (!sessionId) return null;
    
    const handle = Meteor.subscribe('session.details', sessionId);
    if (!handle.ready()) return null;
    
    return SessionsCollection.findOne(sessionId);
  }, [sessionId]);

  const handleSubmit = async (text: string) => {
    if (!text.trim() || isLoading || !sessionId) return;

    const patientMatch = text.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (patientMatch) {
      setCurrentPatient(patientMatch[1]);
      await Meteor.callAsync('sessions.updateMetadata', sessionId, {
        ...currentSession?.metadata,
        patientId: patientMatch[1]
      });
    }

    setIsLoading(true);

    try {
      await Meteor.callAsync('messages.insert', {
        content: text,
        role: 'user',
        timestamp: new Date(),
        sessionId
      });

      const response = await Meteor.callAsync('mcp.processQuery', text, sessionId);

      await Meteor.callAsync('messages.insert', {
        content: response,
        role: 'assistant',
        timestamp: new Date(),
        sessionId
      });
    } catch (error) {
      console.error('Error processing message:', error);
      
      try {
        await Meteor.callAsync('messages.insert', {
          content: 'I encountered an error while processing your request. Please try again or contact support if the issue persists.',
          role: 'assistant',
          timestamp: new Date(),
          sessionId
        });
      } catch (insertError) {
        console.error('Error inserting error message:', insertError);
      }
    } finally {
      setIsLoading(false);
    }
  };

const handleFileUpload = async (file: File) => {
  if (!sessionId) {
    console.error('❌ No session ID available for file upload');
    return;
  }

  setIsUploading(true);
  console.log('📤 Processing file upload:', file.name);

  try {
    // Convert file to base64 with proper error handling
    const base64Content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1];
        if (!base64) {
          reject(new Error('Failed to convert file to base64'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    console.log('📄 File converted to base64, size:', base64Content.length);

    // Upload document with proper metadata
    const uploadResult = await Meteor.callAsync('medical.uploadDocument', {
      filename: file.name,
      content: base64Content,
      mimeType: file.type,
      patientName: currentPatient || 'Unknown Patient',
      sessionId: sessionId
    });

    console.log('✅ Document uploaded successfully:', uploadResult);

    // Process the document if needed
    if (uploadResult.documentId) {
      console.log('🔄 Processing document...');
      const processResult = await Meteor.callAsync('medical.processDocument', uploadResult.documentId, sessionId);
      console.log('✅ Document processed:', processResult);
    }

    // Add success message to chat
    const successMessage = `📄 Document "${file.name}" uploaded successfully.`;
    await Meteor.callAsync('messages.insert', {
      content: successMessage,
      role: 'assistant',
      timestamp: new Date(),
      sessionId
    });

  } catch (error: any) {
    console.error('❌ File upload failed:', error);
    
    let errorMessage = 'Failed to upload document. ';
    
    if (error.message?.includes('File too large')) {
      errorMessage += 'File is too large. Please use a file smaller than 10MB.';
    } else if (error.message?.includes('Invalid file type')) {
      errorMessage += 'Invalid file type. Please use PDF or image files only.';
    } else if (error.message?.includes('MCP')) {
      errorMessage += 'Medical document server is not available. Please contact administrator.';
    } else {
      errorMessage += error.message || 'Please try again.';
    }

    // Add error message to chat
    await Meteor.callAsync('messages.insert', {
      content: `❌ ${errorMessage}`,
      role: 'assistant',
      timestamp: new Date(),
      sessionId
    });
  } finally {
    setIsUploading(false);
  }
};

  const handleNewChat = async () => {
    try {
      const newSessionId = await Meteor.callAsync('sessions.create');
      setSessionId(newSessionId);
      localStorage.setItem('currentSessionId', newSessionId);
      setCurrentPatient('');
      
      if (isMobile) {
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  const handleSelectChat = async (selectedSessionId: string) => {
    try {
      setSessionId(selectedSessionId);
      localStorage.setItem('currentSessionId', selectedSessionId);
      
      await Meteor.callAsync('sessions.setActive', selectedSessionId);
      
      const session = await Meteor.callAsync('sessions.get', selectedSessionId);
      if (session?.metadata?.patientId) {
        setCurrentPatient(session.metadata.patientId);
      } else {
        setCurrentPatient('');
      }
      
      if (isMobile) {
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error('Error selecting chat:', error);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await Meteor.callAsync('sessions.delete', chatId);
      
      if (chatId === sessionId) {
        await handleNewChat();
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="app-container">
      {/* Header - moved outside main-content to always be visible */}
      <SimpleHeader 
        onToggleSidebar={toggleSidebar}
        sidebarOpen={sidebarOpen}
      />

      {/* Sidebar */}
      <SimpleSidebar
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        currentSessionId={sessionId}
      />

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="sidebar-overlay active"
          onClick={handleCloseSidebar}
        />
      )}
      
      {/* Main Content */}
      <div className={cn(
        "main-content",
        !sidebarOpen && "sidebar-closed"
      )}>
        <div className="chat-container">
          <div
            className="messages-container"
            ref={messagesContainerRef}
          >
            {messages.length === 0 && <Overview />}
            
            {messages.map((message, index) => (
              <PreviewMessage 
                key={message._id || index} 
                message={message}
              />
            ))}
            
            {(isLoading || isUploading) && <ThinkingMessage />}
            
            <div ref={messagesEndRef} />
          </div>
          
          <ChatInput
            onSubmit={handleSubmit}
            onFileUpload={handleFileUpload}
            disabled={isLoading || isUploading || !sessionId}
          />
        </div>
      </div>
    </div>
  );
};