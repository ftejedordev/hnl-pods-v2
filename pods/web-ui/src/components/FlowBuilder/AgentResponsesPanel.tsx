import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight, Copy, Check, Circle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { AgentOutput } from '@/components/common/AgentOutput';

interface AgentResponse {
  stepId: string;
  stepName: string;
  agentName: string;
  agentAvatar?: string;
  agentColor?: string;
  output: string;
  timestamp: Date;
  status?: 'completed' | 'running' | 'failed' | 'streaming';
  round?: number;
}

interface AgentResponsesPanelProps {
  responses: AgentResponse[];
  isOpen: boolean;
  onToggle: () => void;
}

export const AgentResponsesPanel: React.FC<AgentResponsesPanelProps> = ({
  responses,
  isOpen,
  onToggle,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (output: string, index: number) => {
    try {
      await navigator.clipboard.writeText(output);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />;
      case 'streaming':
        return <Loader2 className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'running':
        return 'text-blue-600 dark:text-blue-400';
      case 'streaming':
        return 'text-purple-600 dark:text-purple-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <>
      {/* Toggle Button - Only visible when panel is closed */}
      {!isOpen && (
        <Button
          onClick={onToggle}
          variant="outline"
          size="sm"
          className="fixed left-4 top-52 z-50 shadow-lg"
        >
          <ChevronRight className="h-4 w-4 mr-1" />
          Show Responses ({responses.length})
        </Button>
      )}

      {/* Side Panel */}
      <div
        className={`fixed left-0 top-0 h-full bg-background border-r shadow-xl z-40 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '450px', paddingTop: '64px' }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Agent Responses</h2>
                <p className="text-xs text-muted-foreground">
                  {responses.length} response{responses.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button
                onClick={onToggle}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Timeline Responses List */}
          <ScrollArea className="flex-1 px-6 py-4">
            {responses.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-muted-foreground">
                  <p className="text-lg font-medium mb-2">No responses yet</p>
                  <p className="text-sm">
                    Agent responses will appear here as your flow executes
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline vertical line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-border"></div>

                {/* Timeline items */}
                <div className="space-y-6">
                  {responses.map((response, index) => (
                    <div key={`${response.stepId}-${index}`} className="relative pl-12">
                      {/* Timeline avatar with agent logo */}
                      <div className="absolute left-0 top-1">
                        <Avatar className="h-8 w-8 border-2 border-background shadow-md">
                          <AvatarImage src={response.agentAvatar} alt={response.agentName} />
                          <AvatarFallback
                            className="text-xs font-semibold"
                            style={{ backgroundColor: response.agentColor || '#6366f1' }}
                          >
                            {response.agentName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {/* Status indicator badge on avatar */}
                        <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
                          {getStatusIcon(response.status)}
                        </div>
                      </div>

                      {/* Response card */}
                      <div className="border rounded-lg overflow-hidden hover:border-muted-foreground/30 transition-colors">
                        {/* Card header */}
                        <div className="px-3 py-2 bg-muted/20 border-b">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium truncate">
                                  {response.stepName}
                                </h4>
                                {response.status && (
                                  <span className={`text-xs font-medium ${getStatusColor(response.status)}`}>
                                    {response.status}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs h-5">
                                  {response.agentName}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {response.timestamp.toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 flex-shrink-0"
                              onClick={() => handleCopy(response.output, index)}
                              title="Copy response"
                            >
                              {copiedIndex === index ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Card content */}
                        <div className="px-3 py-2">
                          <AgentOutput
                            output={response.output}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Overlay when panel is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};
