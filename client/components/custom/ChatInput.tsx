import React, { useState, useRef } from 'react';
import { Textarea } from "../ui/Textarea";
import { cn } from '/imports/lib/utils';
import { Button } from "../ui/Button";
import { ArrowUpIcon } from "./Icons";
import { Upload, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  onFileUpload: (file: File) => void;
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

export const ChatInput: React.FC<ChatInputProps> = ({ onSubmit, onFileUpload, disabled }) => {
  const [question, setQuestion] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (validTypes.includes(file.type)) {
        onFileUpload(file);
        setShowSuggestions(false);
      } else {
        alert('Please select a PDF or image file (PNG, JPG, JPEG)');
      }
      // Reset file input
      event.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="relative w-full flex flex-col gap-4 chat-input-container">
      {showSuggestions && (
        <div className="hidden md:grid sm:grid-cols-2 gap-2 w-full suggestion-actions">
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
                className={cn(
                  "text-left border border-border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start",
                  "bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground",
                  "transition-colors duration-200 suggestion-card"
                )}
                style={{ height: 'auto' }}
              >
                <span className="font-medium text-foreground">{suggestedAction.title}</span>
                <span className="text-muted-foreground">
                  {suggestedAction.label}
                </span>
              </Button>
            </div>
          ))}
        </div>
      )}
      
      <div className="relative flex gap-2">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
        />
        
        {/* Upload button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleUploadClick}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-2 h-auto self-end mb-2"
          title="Upload medical document"
        >
          <Paperclip className="h-4 w-4" />
          <span className="hidden sm:inline">Upload</span>
        </Button>

        {/* Text input area */}
        <div className="relative flex-1">
          <Textarea
            placeholder="Ask about medical documents or type a message..."
            className={cn(
              "min-h-24 overflow-hidden resize-none rounded-xl text-base pr-12",
              "bg-muted border-border text-foreground placeholder:text-muted-foreground",
              "focus-visible:border-ring transition-colors duration-200"
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
            className={cn(
              "rounded-full absolute bottom-2 right-2",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "transition-colors duration-200"
            )}
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
    </div>
  );
};