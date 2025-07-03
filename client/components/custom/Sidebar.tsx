import React, { useState } from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';
import { PlusCircle, MessageCircle, X, Trash2, Clock, User } from 'lucide-react';
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

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-72 bg-background border-r transform transition-transform duration-200 ease-in-out z-50",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="text-lg font-semibold">Chat History</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <Button
              onClick={() => {
                onNewChat?.();
                onClose();
              }}
              className="w-full flex items-center gap-2"
              variant="outline"
            >
              <PlusCircle className="h-4 w-4" />
              New Chat
            </Button>
          </div>

          {/* Sessions List */}
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-2 pb-4">
              {sessions.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No chat history yet</p>
                  <p className="text-xs mt-1">Start a new chat to begin</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session._id}
                    className={cn(
                      "group relative",
                      deletingId === session._id && "opacity-50"
                    )}
                  >
                    <Button
                      variant={session._id === currentSessionId ? "secondary" : "ghost"}
                      className="w-full justify-start gap-2 pr-10 text-left"
                      onClick={() => {
                        onSelectChat?.(session._id!);
                        onClose();
                      }}
                      disabled={deletingId === session._id}
                    >
                      <MessageCircle className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {session.title}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(session.updatedAt)}
                          </span>
                          {session.metadata?.patientId && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {session.metadata.patientId}
                            </span>
                          )}
                        </div>
                        {session.messageCount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {session.messageCount} message{session.messageCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                      onClick={(e) => handleDeleteChat(e, session._id!)}
                      disabled={deletingId === session._id}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer with session count */}
          {sessions.length > 0 && (
            <div className="p-4 border-t text-xs text-muted-foreground text-center">
              {sessions.length} chat{sessions.length !== 1 ? 's' : ''} in history
            </div>
          )}
        </div>
      </div>
    </>
  );
};