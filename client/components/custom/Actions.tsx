import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';

interface Message {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
}

interface MessageActionsProps {
  message: Message;
}

export const MessageActions: React.FC<MessageActionsProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleLike = () => {
    console.log('like', message.id);
    setLiked(!liked);
    setDisliked(false);
  };

  const handleDislike = () => {
    console.log('dislike', message.id);
    setDisliked(!disliked);
    setLiked(false);
  };

  return (
    <div className="flex items-center space-x-1 mt-2">
      <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 w-8 p-0">
        {copied ? (
          <Check className="h-3 w-3 text-green-600" />
        ) : (
          <Copy className="h-3 w-3 text-gray-500" />
        )}
      </Button>
      <Button variant="outline" size="sm" onClick={handleLike} className="h-8 w-8 p-0">
        <ThumbsUp className={`h-3 w-3 ${liked ? "text-blue-600" : "text-gray-500"}`} />
      </Button>
      <Button variant="outline" size="sm" onClick={handleDislike} className="h-8 w-8 p-0">
        <ThumbsDown className={`h-3 w-3 ${disliked ? "text-red-600" : "text-gray-500"}`} />
      </Button>
    </div>
  );
};