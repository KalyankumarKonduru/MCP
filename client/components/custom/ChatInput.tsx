import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { ArrowUpIcon } from './Icons';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

const suggestedActions = [
  {
    title: "Explain me what can you do?",
    label: "With all the parameters",
    action: "Explain me what can you do? With all the parameters",
  },
  {
    title: "Help me write code",
    label: "for a React component",
    action: "Help me write code for a React component",
  },
  {
    title: "What's the weather like?",
    label: "in my current location",
    action: "What's the weather like in my current location?",
  },
  {
    title: "Tell me a story",
    label: "about space exploration",
    action: "Tell me a story about space exploration",
  },
];

export const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, disabled }) => {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSubmit(input.trim());
      setInput('');
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (action: string) => {
    onSubmit(action);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="relative w-full flex flex-col gap-4">
      {showSuggestions && (
        <div className="hidden md:grid sm:grid-cols-2 gap-2 w-full">
          {suggestedActions.map((suggestedAction, index) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ delay: 0.05 * index }}
              key={index}
              className={index > 1 ? "hidden sm:block" : "block"}
            >
              <Button
                variant="outline"
                onClick={() => handleSuggestionClick(suggestedAction.action)}
                className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start hover:bg-muted"
              >
                <span className="font-medium">{suggestedAction.title}</span>
                <span className="text-muted-foreground text-xs">
                  {suggestedAction.label}
                </span>
              </Button>
            </motion.div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={disabled}
          className="pr-12 min-h-[60px] resize-none rounded-xl bg-muted"
          rows={3}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!input.trim() || disabled}
          className="absolute right-2 bottom-2 rounded-full p-1.5 h-fit m-0.5"
        >
          <ArrowUpIcon size={14} />
        </Button>
      </form>
    </div>
  );
};