import React, { useState, useRef } from 'react';
import { Textarea } from "../ui/Textarea";
import { cn } from '/imports/lib/utils';
import { Button } from "../ui/Button";
import { ArrowUp } from 'lucide-react';
import { ArrowUpIcon } from "./Icons";
import { Upload, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSubmit: (text: string) => void;
  onFileUpload: (file: File) => void;
  disabled?: boolean;
}

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
      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB.');
        event.target.value = '';
        return;
      }
      
      console.log('📤 Starting file upload:', file.name, file.type, file.size);
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
    <div className="input-container">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
      />

      {/* Text input area with inline buttons */}
      <div className="textarea-container">
        <Textarea
          placeholder="Ask about medical documents or type a message..."
          className="chat-textarea"
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

        {/* Upload button - inline with textarea */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUploadClick}
          disabled={disabled}
          className="upload-button-inline"
          title="Upload medical document"
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Send button with guaranteed visible arrow */}
        <Button
          className="send-button"
          onClick={handleSubmit}
          disabled={question.length === 0 || disabled}
        >
          <ArrowUp size={14} />
          {/* Try ArrowUpIcon first, fallback to SVG */}
          <ArrowUpIcon size={14} />
          {/* Fallback SVG in case ArrowUpIcon doesn't render */}
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            style={{ display: 'none' }} // Hide by default, show via CSS if needed
            className="fallback-arrow"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M8.70711 1.39644C8.31659 1.00592 7.68342 1.00592 7.2929 1.39644L2.21968 6.46966L1.68935 6.99999L2.75001 8.06065L3.28034 7.53032L7.25001 3.56065V14.25V15H8.75001V14.25V3.56065L12.7197 7.53032L13.25 8.06065L14.3107 6.99999L13.7803 6.46966L8.70711 1.39644Z"
            />
          </svg>
          
        </Button>
      </div>
    </div>
  );
};