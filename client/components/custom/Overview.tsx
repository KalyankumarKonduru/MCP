// client/components/custom/Overview.tsx
import React from 'react';
import { MessageCircle, Bot as BotIcon, FileText, Search, Upload, Brain, Zap } from "lucide-react";
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
          <Brain size={44} className="text-blue-500" />
          <span className="text-2xl text-foreground">+</span>
          <BotIcon size={44} className="text-muted-foreground" />
          <span className="text-2xl text-foreground">+</span>
          <Zap size={44} className="text-yellow-500" />
        </div>
        
        <div>
          <h1 className="text-3xl font-bold mb-4 text-foreground">Welcome to MCP Pilot</h1>
          <p className="text-muted-foreground mb-6">
            Your intelligent medical assistant powered by Claude's advanced tool selection and healthcare integrations.
          </p>
          
          <div className="text-left space-y-4">
            <div className="rounded-lg p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-5 w-5 text-blue-500 icon" />
                <h3 className="font-semibold text-foreground">Intelligent Tool Selection</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Claude automatically chooses the right tools based on your questions - no commands needed!
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• "Get details about Hank Preston from Aidbox" → Uses patient search tools</div>
                <div>• "Find diabetes documents" → Uses document search tools</div>
                <div>• "What medications does this patient take?" → Combines multiple data sources</div>
              </div>
            </div>
            
            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-green-500 icon" />
                <h3 className="font-semibold text-foreground">Smart Document Processing</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Upload medical documents and Claude will intelligently extract and analyze information:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Automatic text extraction from PDFs and images</div>
                <div>• Medical entity recognition (diagnoses, medications, etc.)</div>
                <div>• Semantic search across all uploaded documents</div>
              </div>
            </div>
            
            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <Search className="h-5 w-5 text-purple-500 icon" />
                <h3 className="font-semibold text-foreground">Multi-Source Healthcare Data</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Access patient data from multiple healthcare systems:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• **Aidbox FHIR**: Patient records, observations, medications</div>
                <div>• **Epic EHR**: Electronic health records integration</div>
                <div>• **Medical Documents**: Uploaded reports and charts</div>
              </div>
            </div>

            <div className="rounded-lg p-4 bg-card text-card-foreground overview-card transition-colors duration-200">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-5 w-5 text-indigo-500 icon" />
                <h3 className="font-semibold text-foreground">Natural Conversation</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Just ask questions naturally - Claude understands context and medical terminology:
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• "Show me recent lab results for this patient"</div>
                <div>• "Compare treatment plans across similar cases"</div>
                <div>• "What's the patient's medication history?"</div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg tip-box transition-colors duration-200">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-800 dark:text-green-200 mb-1">
                  Powered by Claude's Intelligence
                </p>
                <p className="text-green-700 dark:text-green-300">
                  No need to learn commands or syntax. Claude automatically selects the right tools and data sources based on your questions. Just type naturally and let AI handle the complexity!
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg tip-box transition-colors duration-200">
            <div className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                  Try These Examples
                </p>
                <div className="text-blue-700 dark:text-blue-300 space-y-1">
                  <div>💭 "Get me details about all Hank Preston available from Aidbox"</div>
                  <div>🔍 "Search for diabetes documents and analyze treatment patterns"</div>
                  <div>📊 "Show me lab results for patient erXuFYUfucBZaryVksYEcMg3"</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};