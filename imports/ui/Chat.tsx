import React, { useState, useRef } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Header } from '/client/components/custom/Header';
import { ChatInput } from '/client/components/custom/ChatInput';
import { PreviewMessage, ThinkingMessage } from '/client/components/custom/Message';
import { Overview } from '/client/components/custom/Overview';
import { DocumentUpload } from '/client/components/custom/DocumentUpload';
import { useScrollToBottom } from './hooks/useScrollToBottom';
import { MessagesCollection } from '/imports/api/messages/messages';
import { v4 as uuidv4 } from 'uuid';

export const Chat: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [currentPatient, setCurrentPatient] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
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

    // Check if user is mentioning a patient
    const patientMatch = text.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (patientMatch) {
      setCurrentPatient(patientMatch[1]);
    }

    // Check if user wants to upload a document
    if (text.toLowerCase().includes('upload') || text.toLowerCase().includes('document')) {
      setShowUpload(true);
    }

    setIsLoading(true);

    try {
      // Add user message
      await Meteor.callAsync('messages.insert', {
        content: text,
        role: 'user',
        timestamp: new Date(),
        sessionId
      });

      // Process with MCP/LLM (now includes medical context)
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
      try {
        await Meteor.callAsync('messages.insert', {
          content: 'Sorry, I encountered an error while processing your request. Please try again.',
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

  const handleUploadComplete = (result: any) => {
    console.log('Document uploaded:', result);
    // Continue the file after upload
   setShowUpload(false);
  };
 
  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      <div
        className="flex flex-col gap-6 flex-1 overflow-y-scroll pt-4"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && <Overview />}
        
        {/* Document upload area - shown when needed or at start */}
        {(showUpload || messages.length === 0) && (
          <div className="flex justify-center px-4 animate-fade-in">
            <DocumentUpload 
              patientName={currentPatient}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        )}
 
        {messages.map((message, index) => (
          <PreviewMessage key={index} message={message} />
        ))}
        {isLoading && <ThinkingMessage />}
        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-24 min-h-24"
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