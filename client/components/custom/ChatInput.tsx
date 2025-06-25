import React, { useState } from 'react';
import { Textarea } from "../ui/Textarea";
import { cn } from '/imports/lib/utils';
import { Button } from "../ui/Button";
import { ArrowUpIcon } from "./Icons";

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}

const suggestedActions = [
  {
    title: "Explain me what can you do ?",
    label: "With all the parameters",
    action: "Explain me what can you do? With all the parameters",
  },
  {
    title: "Give me a Mars photo",
    label: "of earth date 24th Feb 2024",
    action: "Give me a Mars photo of earth date 24th Feb 2024",
  },
];

export const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, disabled }) => {
  const [question, setQuestion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const handleSubmit = () => {
    if (question.trim() && !disabled) {
      onSubmit(question.trim());
      setQuestion('');
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (action: string) => {
    onSubmit(action);
    setShowSuggestions(false);
  };

  return (
    <div className="relative w-full flex flex-col gap-4">
      {showSuggestions && (
        <div className="hidden md:grid sm:grid-cols-2 gap-2 w-full">
          {suggestedActions.map((suggestedAction, index) => (
            <div
              key={index}
              className={index > 1 ? "hidden sm:block" : "block"}
              style={{
                animation: `fadeIn 0.3s ease-out ${0.05 * index}s both`
              }}
            >
              <Button
                variant="ghost"
                onClick={() => handleSuggestionClick(suggestedAction.action)}
                className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
                style={{ height: 'auto' }}
              >
                <span className="font-medium">{suggestedAction.title}</span>
                <span className="text-muted-foreground">
                  {suggestedAction.label}
                </span>
              </Button>
            </div>
          ))}
        </div>
      )}
      
      <div className="relative">
        <Textarea
          placeholder="Send a message..."
          className={cn(
            "min-h-24 overflow-hidden resize-none rounded-xl text-base bg-muted pr-12"
          )}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!disabled) {
                setShowSuggestions(false);
                handleSubmit();
              }
            }
          }}
          rows={3}
          autoFocus
        />

        <Button
          className="rounded-full absolute bottom-2 right-2"
          style={{ 
            padding: '0.375rem',
            height: 'fit-content',
            margin: '0.125rem',
            border: '1px solid var(--border)'
          }}
          onClick={handleSubmit}
          disabled={question.length === 0 || disabled}
        >
          <ArrowUpIcon size={14} />
        </Button>
      </div>
    </div>
  );
};