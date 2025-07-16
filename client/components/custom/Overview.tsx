import React from 'react';
import { 
  Sparkles, 
  FileText, 
  Database, 
  Search, 
  Brain, 
  Zap,
  Activity,
  Users,
  Shield,
  Globe
} from "lucide-react";
import { cn } from '/imports/lib/utils';

export const Overview: React.FC = () => {
  const capabilities = [
    {
      icon: <Brain className="h-6 w-6" />,
      title: "Intelligent Tool Selection",
      description: "I automatically choose the right medical tools based on your questions—no commands needed.",
      examples: [
        "\"Find diabetes patients\" → Uses patient search tools",
        "\"Upload lab report\" → Uses document processing",
        "\"Get medication history\" → Combines multiple data sources"
      ]
    },
    {
      icon: <FileText className="h-6 w-6" />,
      title: "Medical Document Analysis",
      description: "Upload PDFs, images, and medical reports for intelligent extraction and analysis.",
      examples: [
        "Automatic text extraction from any format",
        "Medical entity recognition (diagnoses, medications)",
        "Semantic search across all documents"
      ]
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: "Healthcare Data Integration",
      description: "Access patient data from multiple healthcare systems seamlessly.",
      examples: [
        "Epic EHR: Electronic health records",
        "Aidbox FHIR: Structured patient data", 
        "Medical Documents: Uploaded reports and charts"
      ]
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: "Natural Language Queries",
      description: "Ask questions naturally—I understand medical terminology and context.",
      examples: [
        "\"Show recent lab results for this patient\"",
        "\"Compare treatment plans across similar cases\"",
        "\"What medications is the patient taking?\""
      ]
    }
  ];

  const exampleQueries = [
    {
      icon: <Users className="h-4 w-4" />,
      text: "Get me details about all Hank Preston available from Aidbox",
      category: "Patient Search"
    },
    {
      icon: <FileText className="h-4 w-4" />,
      text: "Upload this lab report and find similar cases",
      category: "Document Analysis"
    },
    {
      icon: <Activity className="h-4 w-4" />,
      text: "Show me lab results for patient erXuFYUfucBZaryVksYEcMg3",
      category: "Clinical Data"
    },
    {
      icon: <Database className="h-4 w-4" />,
      text: "Search Epic for diabetes patients and get their medications",
      category: "Multi-System Query"
    }
  ];

  return (
    <div className="overview-container">
      <div className="overview-header">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-4xl font-light text-muted-foreground">+</div>
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <Shield className="h-6 w-6 text-white" />
          </div>
        </div>
        
        <h1 className="overview-title">
          How can I help you today?
        </h1>
        
        <p className="overview-subtitle">
          I'm your intelligent medical assistant powered by Claude's advanced reasoning and healthcare integrations. I can help you analyze medical documents, search patient records, and access healthcare data from multiple systems.
        </p>
      </div>

      <div className="overview-grid">
        {capabilities.map((capability, index) => (
          <div 
            key={index}
            className="overview-card"
            style={{
              animationDelay: `${index * 150}ms`
            }}
          >
            <div className="overview-card-icon">
              {capability.icon}
            </div>
            
            <div className="overview-card-title">
              {capability.title}
            </div>
            
            <div className="overview-card-description">
              {capability.description}
            </div>
            
            <div className="mt-4 space-y-2">
              {capability.examples.map((example, exampleIndex) => (
                <div 
                  key={exampleIndex}
                  className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2"
                >
                  {example}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-full px-4 py-2 mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Try these examples</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exampleQueries.map((query, index) => (
            <div
              key={index}
              className="group cursor-pointer bg-muted/50 hover:bg-muted border border-transparent hover:border-primary/20 rounded-lg p-4 transition-all duration-200"
              style={{
                animationDelay: `${600 + index * 100}ms`
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  {query.icon}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-primary mb-1">
                    {query.category}
                  </div>
                  <div className="text-sm text-foreground group-hover:text-primary transition-colors">
                    "{query.text}"
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Brain className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            
            <div className="flex-1">
              <div className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                Powered by Claude's Intelligence
              </div>
              <div className="text-sm text-green-700 dark:text-green-300 leading-relaxed">
                No need to learn commands or syntax. I automatically select the right tools and data sources based on your natural language questions. Just ask what you need, and I'll handle the complexity behind the scenes.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span>Connected to Epic EHR, Aidbox FHIR, and Medical Document systems</span>
        </div>
      </div>
    </div>
  );
};