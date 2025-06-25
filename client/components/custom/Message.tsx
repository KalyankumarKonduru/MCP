import React from 'react';
import { motion } from 'framer-motion';
import { Markdown } from './Markdown';
import { MessageActions } from './Actions';
import { SparklesIcon } from './Icons';

interface Message {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp?: Date;
}

interface PreviewMessageProps {
  message: Message;
}

export const PreviewMessage: React.FC<PreviewMessageProps> = ({ message }) => {
  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-role={message.role}
    >
      <div className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        {message.role === 'assistant' && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div className={`flex flex-col ${message.role === 'user' ? 'max-w-[80%]' : 'w-full'}`}>
          <div
            className={`rounded-lg p-4 ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground ml-auto'
                : 'bg-muted'
            }`}
          >
            {message.role === 'assistant' ? (
              <Markdown>{message.content}</Markdown>
            ) : (
              <p className="whitespace-pre-wrap">{message.content}</p>
            )}
          </div>

          {message.role === 'assistant' && <MessageActions message={message} />}
        </div>
      </div>
    </motion.div>
  );
};

export const ThinkingMessage: React.FC = () => {
  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 0.2 } }}
    >
      <div className="flex gap-4">
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          <span className="text-muted-foreground">Thinking...</span>
        </div>
      </div>
    </motion.div>
  );
};