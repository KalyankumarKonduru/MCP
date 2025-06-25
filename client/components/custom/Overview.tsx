import React from 'react';
import { MessageCircle, Bot as BotIcon } from "lucide-react";

export const Overview: React.FC = () => {
  return (
    <div
      className="max-w-3xl mx-auto md:mt-20"
      style={{
        animation: 'fadeIn 0.3s ease-out 0.75s both',
        transform: 'scale(0.98)',
        animationFillMode: 'forwards'
      }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl mx-auto">
        <div className="flex flex-row justify-center gap-4 items-center">
          <BotIcon size={44} />
          <span className="text-2xl">+</span>
          <MessageCircle size={44} />
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
    </div>
  );
};