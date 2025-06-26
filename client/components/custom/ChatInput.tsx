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
    title: "Upload medical document",
    label: "PDF or image file",
    action: "I'd like to upload a medical document",
  },
  {
    title: "Search patient diagnosis",
    label: "Find specific conditions",
    action: "What diagnoses does the patient have?",
  },
  {
    title: "Review medications",
    label: "Current prescriptions",
    action: "Show me the patient's current medications",
  },
  {
    title: "Lab results summary",
    label: "Recent test results",
    action: "What are the latest lab results?",
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
          placeholder="Ask about medical documents or type a message..."
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