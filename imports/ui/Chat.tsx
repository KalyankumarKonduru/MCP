import React, { useState, useRef, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Header } from '/client/components/custom/Header';
import { ChatInput } from '/client/components/custom/ChatInput';
import { PreviewMessage, ThinkingMessage } from '/client/components/custom/Message';
import { Overview } from '/client/components/custom/Overview';
import { useScrollToBottom } from './hooks/useScrollToBottom';
import { MessagesCollection } from '/imports/api/messages/messages';
import { v4 as uuidv4 } from 'uuid';

export const Chat: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messagesContainerRef] = useScrollToBottom<HTMLDivElement>();

  const messages = useTracker(() => {
    const handle = Meteor.subscribe('messages', sessionId);
    if (!handle.ready()) return [];
    
    return MessagesCollection.find(
      { sessionId },
      { sort: { timestamp: 1 } }
    ).fetch();
  }, [sessionId]);

  const handleSubmit = async (text: string) => {
    if (!text.trim() || isLoading) return;

    setIsLoading(true);

    try {
      // Add user message
      await Meteor.callAsync('messages.insert', {
        content: text,
        role: 'user',
        timestamp: new Date(),
        sessionId
      });

      // Process with MCP/LLM
      const response = await Meteor.callAsync('mcp.processQuery', text);

      // Add assistant message
      await Meteor.callAsync('messages.insert', {
        content: response,
        role: 'assistant',
        timestamp: new Date(),
        sessionId
      });
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Add error message
      await Meteor.callAsync('messages.insert', {
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        role: 'assistant',
        timestamp: new Date(),
        sessionId
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header />
      
      <div
        className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && <Overview />}
        
        {messages.map((message) => (
          <PreviewMessage
            key={message._id}
            message={message}
          />
        ))}
        
        {isLoading && <ThinkingMessage />}
        
        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-[24px] min-h-[24px]"
        />
      </div>

      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput
          onSubmit={handleSubmit}
          disabled={isLoading}
        />
      </div>
    </div>
  );
};