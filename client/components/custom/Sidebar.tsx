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
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-950 transform transition-transform duration-200 ease-in-out z-50",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ borderRight: '1px solid rgb(229, 231, 235)' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center px-3 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chats</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* New Chat Button */}
          <div className="px-3 pb-2">
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
            <div className="px-2 space-y-1">
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
                        ? "bg-gray-100 dark:bg-gray-800" 
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
                    {/* Arrow icon - always visible on active, hover for others */}
                    <div className="flex-shrink-0 w-6 h-9 flex items-center justify-center">
                      <ChevronRight 
                        className={cn(
                          "h-3 w-3 text-gray-400 transition-opacity duration-150",
                          session._id === currentSessionId 
                            ? "opacity-100" 
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
                            ? "text-gray-900 dark:text-white font-medium" 
                            : "text-gray-700 dark:text-gray-300"
                        )}>
                          {session.title}
                        </span>

                        {/* Delete button - only show on hover */}
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

                      {/* Patient info - subtle, no badge */}
                      {session.metadata?.patientId && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
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