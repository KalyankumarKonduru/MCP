import React, { useState, useRef, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Header } from '/client/components/custom/Header';
import { ChatInput } from '/client/components/custom/ChatInput';
import { PreviewMessage, ThinkingMessage } from '/client/components/custom/Message';
import { Overview } from '/client/components/custom/Overview';
import { useScrollToBottom } from './hooks/useScrollToBottom';
import { MessagesCollection } from '/imports/api/messages/messages';
import { SessionsCollection } from '/imports/api/sessions/sessions';

export const Chat: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [currentPatient, setCurrentPatient] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messagesContainerRef] = useScrollToBottom<HTMLDivElement>();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initialize or load session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        // Try to load from localStorage first
        const savedSessionId = localStorage.getItem('currentSessionId');
        
        if (savedSessionId) {
          // Verify session still exists
          const session = await Meteor.callAsync('sessions.get', savedSessionId).catch(() => null);
          if (session) {
            setSessionId(savedSessionId);
            // Load patient context from session
            if (session.metadata?.patientId) {
              setCurrentPatient(session.metadata.patientId);
            }
            return;
          }
        }
        
        // Check for active session
        const { sessions } = await Meteor.callAsync('sessions.list', 1, 0);
        const activeSession = sessions.find((s: any) => s.isActive);
        
        if (activeSession) {
          setSessionId(activeSession._id);
          localStorage.setItem('currentSessionId', activeSession._id);
          if (activeSession.metadata?.patientId) {
            setCurrentPatient(activeSession.metadata.patientId);
          }
        } else {
          // Create new session
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

  // Subscribe to messages for current session
  const messages = useTracker(() => {
    if (!sessionId) return [];
    
    const handle = Meteor.subscribe('messages', sessionId);
    if (!handle.ready()) return [];
    
    return MessagesCollection.find(
      { sessionId },
      { sort: { timestamp: 1 } }
    ).fetch();
  }, [sessionId]);

  // Subscribe to current session details
  const currentSession = useTracker(() => {
    if (!sessionId) return null;
    
    const handle = Meteor.subscribe('session.details', sessionId);
    if (!handle.ready()) return null;
    
    return SessionsCollection.findOne(sessionId);
  }, [sessionId]);

  const handleSubmit = async (text: string) => {
    if (!text.trim() || isLoading || !sessionId) return;

    console.log(`💬 User submitted: "${text}"`);

    // Check if user is mentioning a patient
    const patientMatch = text.match(/(?:patient|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    if (patientMatch) {
      setCurrentPatient(patientMatch[1]);
      console.log(`👤 Detected patient: ${patientMatch[1]}`);
      
      // Update session with patient context
      await Meteor.callAsync('sessions.updateMetadata', sessionId, {
        ...currentSession?.metadata,
        patientId: patientMatch[1]
      });
    }

    setIsLoading(true);

    try {
      // Add user message with session context
      await Meteor.callAsync('messages.insert', {
        content: text,
        role: 'user',
        timestamp: new Date(),
        sessionId
      });

      console.log('📤 Calling mcp.processQuery with session...');

      // Process with session context
      const response = await Meteor.callAsync('mcp.processQuery', text, sessionId);

      console.log('📥 Received response');

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
    if (isUploading || isLoading || !sessionId) return;

    console.log('Starting file upload:', file.name, file.type, file.size);
    setIsUploading(true);

    try {
      // Show upload status message
      await Meteor.callAsync('messages.insert', {
        content: `📤 Uploading "${file.name}"...`,
        role: 'user',
        timestamp: new Date(),
        sessionId
      });

      // Convert file to base64
      const base64Content = await fileToBase64(file);
      console.log('File converted to base64, length:', base64Content.length);

      // Upload document with session context
      console.log('Calling medical.uploadDocument...');
      const uploadResult = await Meteor.callAsync('medical.uploadDocument', {
        filename: file.name,
        content: base64Content,
        mimeType: file.type,
        patientName: currentPatient || 'Unknown Patient',
        sessionId
      });

      console.log('Upload result:', uploadResult);

      // Process document
      console.log('Calling medical.processDocument...');
      const processResult = await Meteor.callAsync('medical.processDocument', uploadResult.documentId, sessionId);
      
      console.log('Process result:', processResult);

      // Create a comprehensive success message
      let successMessage = `✅ **Document "${file.name}" uploaded and processed successfully!**\n\n`;
      
      // Add processing details
      successMessage += `📊 **Processing Summary:**\n`;
      successMessage += `• Document ID: ${uploadResult.documentId}\n`;
      
      if (processResult.textExtraction) {
        successMessage += `• Text extracted: ${processResult.textExtraction.extractedText?.length || 0} characters\n`;
        successMessage += `• Extraction confidence: ${Math.round(processResult.textExtraction.confidence || 0)}%\n`;
      }
      
      if (processResult.medicalEntities) {
        successMessage += `• Medical entities found: ${processResult.medicalEntities.entities?.length || 0}\n`;
        
        // Show a few example entities
        if (processResult.medicalEntities.entities && processResult.medicalEntities.entities.length > 0) {
          const topEntities = processResult.medicalEntities.entities
            .slice(0, 5)
            .map((e: any) => `${e.text} (${e.label})`)
            .join(', ');
          successMessage += `• Key terms found: ${topEntities}\n`;
        }
      }
      
      if (currentPatient && currentPatient !== 'Unknown Patient') {
        successMessage += `• Assigned to patient: ${currentPatient}\n`;
      }
      
      successMessage += `\n💡 **You can now:**\n`;
      successMessage += `• Search for this document using terms like "${file.name.split('.')[0]}"\n`;
      successMessage += `• Ask questions about the medical content\n`;
      successMessage += `• Search for specific conditions, medications, or procedures mentioned in the document`;

      await Meteor.callAsync('messages.insert', {
        content: successMessage,
        role: 'assistant',
        timestamp: new Date(),
        sessionId
      });

    } catch (error: any) {
      console.error('Upload error:', error);
      
      let errorMessage = `❌ **Failed to upload document "${file.name}"**\n\n`;
      
      if (error.error === 'upload-failed') {
        errorMessage += `**Error:** The medical server may be offline or not configured properly.\n`;
        errorMessage += `**Solution:** Please contact your administrator to check the MCP server connection.`;
      } else if (error.error === 'processing-failed') {
        errorMessage += `**Error:** The document was uploaded but processing failed.\n`;
        errorMessage += `**Solution:** Try uploading a different file format or check if the document contains readable text.`;
      } else if (error.reason) {
        errorMessage += `**Error:** ${error.reason}\n`;
        errorMessage += `**Solution:** Please check the file format and try again.`;
      } else {
        errorMessage += `**Error:** ${error.message || 'Unknown error occurred'}\n`;
        errorMessage += `**Solution:** Please try again or contact support if the issue persists.`;
      }

      // Add error message
      await Meteor.callAsync('messages.insert', {
        content: errorMessage,
        role: 'assistant',
        timestamp: new Date(),
        sessionId
      });
    } finally {
      setIsUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (data:image/png;base64,)
        const base64Content = base64.split(',')[1];
        resolve(base64Content);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleNewChat = async () => {
    try {
      const newSessionId = await Meteor.callAsync('sessions.create');
      setSessionId(newSessionId);
      localStorage.setItem('currentSessionId', newSessionId);
      setCurrentPatient(''); // Reset patient context
      console.log('✅ Created new chat session:', newSessionId);
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
  };

  const handleSelectChat = async (selectedSessionId: string) => {
    try {
      setSessionId(selectedSessionId);
      localStorage.setItem('currentSessionId', selectedSessionId);
      
      // Set as active session
      await Meteor.callAsync('sessions.setActive', selectedSessionId);
      
      // Load patient context from session
      const session = await Meteor.callAsync('sessions.get', selectedSessionId);
      if (session?.metadata?.patientId) {
        setCurrentPatient(session.metadata.patientId);
      } else {
        setCurrentPatient('');
      }
      
      console.log('✅ Switched to chat session:', selectedSessionId);
    } catch (error) {
      console.error('Error selecting chat:', error);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      await Meteor.callAsync('sessions.delete', chatId);
      
      // If deleted current session, create new one
      if (chatId === sessionId) {
        await handleNewChat();
      }
      
      console.log('✅ Deleted chat session:', chatId);
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };
 
  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header 
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        currentSessionId={sessionId}
      />
      <div
        className="flex flex-col gap-6 flex-1 overflow-y-scroll pt-4"
        ref={messagesContainerRef}
      >
        {messages.length === 0 && <Overview />}
        
        {messages.map((message, index) => (
          <PreviewMessage key={message._id || index} message={message} />
        ))}
        
        {(isLoading || isUploading) && <ThinkingMessage />}
        
        <div
          ref={messagesEndRef}
          className="shrink-0 min-w-24 min-h-24"
        />
      </div>
      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput
          onSubmit={handleSubmit}
          onFileUpload={handleFileUpload}
          disabled={isLoading || isUploading || !sessionId}
        />
      </div>
    </div>
  );
};