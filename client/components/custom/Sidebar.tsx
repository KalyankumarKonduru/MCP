// Updated Sidebar.tsx
import React, { useState } from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { PlusCircle, X, Trash2, ChevronRight } from 'lucide-react';
import { cn } from '/imports/lib/utils';
import { SessionsCollection } from '/imports/api/sessions/sessions';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat?: () => void;
  onSelectChat?: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  currentSessionId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  onNewChat, 
  onSelectChat,
  onDeleteChat,
  currentSessionId
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
      await onDeleteChat?.(sessionId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar - Updated positioning */}
      <div
        className={cn(
          // Mobile: fixed positioning with transform
          "lg:relative lg:translate-x-0 fixed inset-y-0 left-0 z-50",
          // Width transitions
          "lg:transition-all lg:duration-300 lg:ease-in-out",
          isOpen ? "lg:w-64" : "lg:w-0",
          // Mobile: always full width when open, hidden when closed
          "w-64 lg:w-auto",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          // Background and border
          "bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-700",
          // Overflow handling
          "overflow-hidden"
        )}
      >
        <div className={cn(
          "flex flex-col h-full transition-opacity duration-300",
          isOpen ? "opacity-100" : "lg:opacity-0 opacity-100"
        )}>
          {/* Header */}
          <div className="flex justify-between items-center px-3 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chats</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* New Chat Button */}
          <div className="px-3 pb-2 pt-2 border-b border-gray-200 dark:border-gray-700">
            <Button
              onClick={() => {
                onNewChat?.();
                onClose();
              }}
              variant="outline"
              className="w-full justify-start h-9 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
              size="sm"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              New chat
            </Button>
          </div>

          {/* Sessions List */}
          <ScrollArea className="flex-1">
            <div className="px-2 py-2 space-y-1">
              {sessions.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8 px-4">
                  <p className="text-sm">No conversations yet</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session._id}
                    className={cn(
                      "group relative flex items-center rounded-lg cursor-pointer transition-all duration-150",
                      session._id === currentSessionId 
                        ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" 
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                      deletingId === session._id && "opacity-50"
                    )}
                    onClick={() => {
                      onSelectChat?.(session._id!);
                      onClose();
                    }}
                    onMouseEnter={() => setHoveredId(session._id!)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Arrow icon */}
                    <div className="flex-shrink-0 w-6 h-9 flex items-center justify-center">
                      <ChevronRight 
                        className={cn(
                          "h-3 w-3 text-gray-400 transition-opacity duration-150",
                          session._id === currentSessionId 
                            ? "opacity-100 text-blue-600 dark:text-blue-400" 
                            : hoveredId === session._id 
                              ? "opacity-60" 
                              : "opacity-0"
                        )} 
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 py-2 pr-2">
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-sm truncate",
                          session._id === currentSessionId 
                            ? "text-blue-900 dark:text-blue-100 font-medium" 
                            : "text-gray-700 dark:text-gray-300"
                        )}>
                          {session.title}
                        </span>

                        {/* Delete button */}
                        {hoveredId === session._id && session._id !== currentSessionId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 ml-1"
                            onClick={(e) => handleDeleteChat(e, session._id!)}
                            disabled={deletingId === session._id}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Patient info */}
                      {session.metadata?.patientId && (
                        <div className={cn(
                          "text-xs truncate mt-0.5",
                          session._id === currentSessionId
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-gray-500 dark:text-gray-400"
                        )}>
                          Patient: {session.metadata.patientId}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
};