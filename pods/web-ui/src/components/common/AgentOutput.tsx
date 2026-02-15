import React from 'react';
import { Button } from '../ui/button';
import { Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface ToolCall {
  name: string;
  arguments: string;
  connectionId?: string;
}

interface ParsedOutput {
  toolCalls: ToolCall[];
  content: string;
}

interface AgentOutputProps {
  output: string;
  className?: string;
  // Optional structured tool data from step results
  toolResults?: Array<{
    tool_name: string;
    arguments: any;
    result: any;
    connection_id?: string;
    success?: boolean;
    error?: string;
  }>;
}

export const AgentOutput: React.FC<AgentOutputProps> = ({
  output,
  className = '',
  toolResults
}) => {
  const parseAgentOutput = (text: string): ParsedOutput => {
    const toolCalls: ToolCall[] = [];
    let content = text;

    // First decode HTML entities that might be present
    const decodeHtml = (html: string) => {
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    };

    content = decodeHtml(content);

    // Parse XML-style tool calls (like <get_github_issues>...</get_github_issues>)
    const xmlToolCallMatches = content.matchAll(/<([a-zA-Z_][a-zA-Z0-9_]*?)>(.*?)<\/\1>/gs);
    for (const match of xmlToolCallMatches) {
      const toolName = match[1];
      const toolContent = match[2].trim();
      
      // Parse the content inside the tool call
      let arguments_obj: any = {};
      
      // Try to extract XML tags inside the tool call
      const innerTagMatches = toolContent.matchAll(/<([a-zA-Z_][a-zA-Z0-9_]*?)>(.*?)<\/\1>/gs);
      for (const innerMatch of innerTagMatches) {
        arguments_obj[innerMatch[1]] = innerMatch[2];
      }
      
      toolCalls.push({
        name: toolName,
        arguments: JSON.stringify(arguments_obj, null, 2)
      });
      
      // Remove this tool call from content
      content = content.replace(match[0], '').trim();
    }

    // Parse tool calls section (original format)
    const toolCallsMatch = content.match(/<\|tool_calls_section_begin\|>(.*?)<\|tool_calls_section_end\|>/s);
    if (toolCallsMatch) {
      const toolCallsSection = toolCallsMatch[1];
      
      // Extract individual tool calls
      const toolCallMatches = toolCallsSection.matchAll(/<\|tool_call_begin\|>(.*?)<\|tool_call_argument_begin\|>(.*?)<\|tool_call_end\|>/gs);
      
      for (const match of toolCallMatches) {
        const toolNumber = match[1].trim();
        const argumentsJson = match[2].trim();
        
        try {
          const args = JSON.parse(argumentsJson);
          // Try to extract a meaningful tool name from the arguments
          let toolName = `Tool ${toolNumber}`;
          
          // Look for common patterns to identify tool names
          if (args.tool_name) {
            toolName = args.tool_name;
          } else if (args.function_name) {
            toolName = args.function_name;
          } else if (typeof args === 'object' && Object.keys(args).length > 0) {
            // Use the first key as a hint for the tool name
            const firstKey = Object.keys(args)[0];
            if (firstKey.includes('cliente') || firstKey.includes('customer')) {
              toolName = 'buscar_clientes_en_monday';
            } else if (firstKey.includes('cotizacion') || firstKey.includes('quote')) {
              toolName = 'generar_cotizacion';
            } else {
              toolName = `Tool ${toolNumber}`;
            }
          }
          
          toolCalls.push({
            name: toolName,
            arguments: argumentsJson
          });
        } catch (e) {
          // If JSON parsing fails, still show the raw arguments
          toolCalls.push({
            name: `Tool ${toolNumber}`,
            arguments: argumentsJson
          });
        }
      }
      
      // Remove the tool calls section from content
      content = content.replace(/<\|tool_calls_section_begin\|>.*?<\|tool_calls_section_end\|>/s, '').trim();
    }

    return { toolCalls, content };
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(output);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const { toolCalls: parsedToolCalls, content } = parseAgentOutput(output);
  
  // Use structured tool data if available, otherwise fall back to parsed tool calls
  const toolCalls = toolResults && toolResults.length > 0 
    ? toolResults.map(tool => ({
        name: tool.tool_name,
        arguments: JSON.stringify(tool.arguments),
        connectionId: tool.connection_id
      }))
    : parsedToolCalls;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Tool Calls Section */}
      {toolCalls.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Tool Calls ({toolCalls.length})
          </div>
          {toolCalls.map((toolCall, index) => (
            <div 
              key={index}
              className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 p-3 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full"></div>
                <span className="font-medium text-blue-700 dark:text-blue-200 text-sm">
                  {toolCall.name}
                </span>
                {toolCall.connectionId && (
                  <span className="text-blue-600 dark:text-blue-300 text-xs">
                    via {toolCall.connectionId}
                  </span>
                )}
              </div>
              <div className="bg-blue-100/80 dark:bg-blue-900/40 p-2 rounded text-xs font-mono">
                <pre className="text-blue-800 dark:text-blue-100 whitespace-pre-wrap">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(toolCall.arguments), null, 2);
                    } catch (e) {
                      return toolCall.arguments;
                    }
                  })()}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      {content && (
        <div className="relative group">
          <div className="text-sm bg-card border rounded-lg p-4 shadow-sm">
            <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Custom styling for code blocks
                  code: ({ node, className, children, ...props }: any) => {
                    const inline = !className?.startsWith('language-');
                    return !inline ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Custom styling for links
                  a: ({ node, children, ...props }) => (
                    <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props}>
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>

            {/* Copy button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={copyToClipboard}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
              title="Copy to clipboard"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};