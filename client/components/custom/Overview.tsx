import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Bot } from 'lucide-react';

export const Overview: React.FC = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.75 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl mx-auto">
        <div className="flex flex-row justify-center gap-4 items-center">
          <Bot size={44} className="text-primary" />
          <span className="text-2xl">+</span>
          <MessageCircle size={44} className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold mb-4">Welcome to MCP Pilot</h1>
          <p className="text-muted-foreground">
            A lightweight and modern chat interface for MCP and LLM interactions with Markdown support!
            <br />
            Start a conversation by typing a message below or choosing from the suggested prompts.
          </p>
        </div>
      </div>
    </motion.div>
  );
};