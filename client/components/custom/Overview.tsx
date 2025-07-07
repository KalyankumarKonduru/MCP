import React from 'react';
import { MessageCircle, Bot as BotIcon, FileText, Search, Upload } from "lucide-react";
import { cn } from '/imports/lib/utils';

export const Overview: React.FC = () => {
  return (
    <div
      className={cn(
        "max-w-3xl mx-auto md:mt-20 overview-container",
        "transition-colors duration-200"
      )}
      style={{
        animation: 'fadeIn 0.3s ease-out 0.75s both',
        transform: 'scale(0.98)',
        animationFillMode: 'forwards'
      }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl mx-auto">
        <div className="flex flex-row justify-center gap-4 items-center overview-icons">
          <BotIcon size={44} className="text-muted-foreground" />
          <span className="text-2xl text-foreground">+</span>
          <FileText size={44} className="text-muted-foreground" />
          <span className="text-2xl text-foreground">+</span>
          <Search size={44} className="text-muted-foreground" />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold mb-4 text-foreground">Welcome to MCP Pilot</h1>
          <p className="text-muted-foreground mb-6">
            Your intelligent medical document assistant powered by AI and semantic search.
          </p>
          
          <div className="text-left space-y-4">
            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Upload className="h-5 w-5 text-blue-500 icon" />
                <h3 className="font-semibold text-foreground">Upload Documents</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload medical documents (PDF, images) and I'll extract text, identify medical entities, and make them searchable.
              </p>
            </div>
            
            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-5 w-5 text-green-500 icon" />
                <h3 className="font-semibold text-foreground">Smart Search</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Search for medical information using natural language:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• "search for john" - Find patient records</div>
                <div>• "find diabetes diagnosis" - Search conditions</div>
                <div>• "show me lab results" - Find specific document types</div>
              </div>
            </div>
            
            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-5 w-5 text-purple-500 icon" />
                <h3 className="font-semibold text-foreground">Ask Questions</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Ask questions about your medical documents:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• "What medications is John taking?"</div>
                <div>• "Summarize the lab results"</div>
                <div>• "What conditions were diagnosed?"</div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg tip-box transition-colors duration-200">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              💡 <strong>Tip:</strong> Start by uploading a medical document, then try searching for specific information within it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};