import React from 'react';
import { cn } from '/imports/lib/utils';
import { SparklesIcon } from "./Icons";
import { Markdown } from "./Markdown";
import { MessageActions } from "./Actions";

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
    <div
      className="w-full mx-auto max-w-3xl px-4 group/message animate-fade-in"
      data-role={message.role}
    >
      <div className={cn(
        "flex gap-4 w-full rounded-xl",
        message.role === 'user' && "message-user"
      )}>
        {message.role === "assistant" && (
          <div className="w-8 h-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
            <SparklesIcon size={14} />
          </div>
        )}

        <div className="flex flex-col w-full">
          {message.content && (
            <div className="flex flex-col gap-4 text-left">
              <Markdown>{message.content}</Markdown>
            </div>
          )}

          {message.role === "assistant" && <MessageActions message={message} />}
        </div>
      </div>
    </div>
  );
};

export const ThinkingMessage: React.FC = () => {
  return (
    <div
      className="w-full mx-auto max-w-3xl px-4 group/message animate-fade-in"
      data-role="assistant"
    >
      <div className="flex gap-4 w-full rounded-xl">
        <div className="w-8 h-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: 'var(--primary)' }}></div>
          <span className="text-muted-foreground">Thinking...</span>
        </div>
      </div>
    </div>
  );
};