import React, { memo, useMemo } from 'react';

interface MarkdownProps {
  children: string;
}

const NonMemoizedMarkdown: React.FC<MarkdownProps> = ({ children }) => {
  const formattedContent = useMemo(() => {
    let content = children;
    
    // Handle code blocks with language specification
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre class="bg-muted p-4 rounded-lg overflow-x-auto my-4"><code class="text-sm">${code.trim()}</code></pre>`;
    });
    
    // Handle inline code
    content = content.replace(/`([^`]+)`/g, '<code class="bg-muted px-2 py-1 rounded text-sm font-mono">$1</code>');
    
    // Handle bold text
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    
    // Handle italic text
    content = content.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    
    // Handle headers
    content = content.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>');
    content = content.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-6 mb-2">$1</h2>');
    content = content.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-semibold mt-6 mb-2">$1</h1>');
    
    // Handle unordered lists
    content = content.replace(/^\* (.*)$/gm, '<li class="py-1">$1</li>');
    content = content.replace(/(<li.*<\/li>)/s, '<ul class="list-disc list-outside ml-4 mb-4">$1</ul>');
    
    // Handle ordered lists
    content = content.replace(/^\d+\. (.*)$/gm, '<li class="py-1">$1</li>');
    
    // Handle links
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Handle line breaks
    content = content.replace(/\n/g, '<br>');
    
    return content;
  }, [children]);

  return (
    <div 
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: formattedContent }}
    />
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);