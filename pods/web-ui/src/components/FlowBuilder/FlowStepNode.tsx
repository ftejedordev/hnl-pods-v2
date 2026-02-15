import React, { useState } from 'react';
import {
  Handle,
  Position,
} from '@xyflow/react';
import type { FlowStep } from '../../types/flow';
import type { Agent } from '../../types/agent';
import type { LLM } from '../../types/llm';
import type { McpServerConnection } from '../../types/mcp';
import { Circle, Eye, EyeOff, Loader2, Copy, Check, Sparkles, UserCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { AgentOutput } from '../common/AgentOutput';

// Types for streaming content
export interface LLMResponse {
  content: string;
  round: number;
  tool_calls?: any;
  model_used?: string;
  timestamp: string;
  isEmpty?: boolean;
}

export interface ToolCall {
  tool_name: string;
  status: 'started' | 'completed' | 'failed';
  round: number;
  call_index: number;
  timestamp: string;
  result?: any;
}

export interface FeedbackIteration {
  iteration: number;
  role: 'assessor' | 'improver';
  output: string;
  timestamp: string;
  stepName: string;
}

export interface StepOutputData {
  llm_responses?: LLMResponse[];
  tool_calls?: ToolCall[];
  feedback_iterations?: FeedbackIteration[];
  final_output?: string;
}

export interface FlowStepNodeData extends FlowStep {
  onEdit: () => void;
  onDelete: () => void;
  onPlay?: () => void;
  isStart: boolean;
  isRunning?: boolean;
  isCompleted?: boolean;
  isSelected?: boolean;
  onUpdateStep: (step: FlowStep) => void;
  isNewStep?: boolean;
  variables?: Record<string, any>;
  onStepComplete?: (stepId: string) => void;
  agents?: Agent[];
  llms?: LLM[];
  mcpConnections?: McpServerConnection[];
  mcpToolCounts?: Record<string, number>;
  agentsLoading?: boolean;
  stepOutputs?: Record<string, StepOutputData>;
}

// Function to clean content by removing unwanted HTML tags
const cleanContent = (text: string): string => {
  if (!text) return text;

  const tagPatternsToRemove = [
    /<answer[^>]*>(.*?)<\/answer>/gs,
    /<think[^>]*>(.*?)<\/think>/gs,
    /<reasoning[^>]*>(.*?)<\/reasoning>/gs,
    /<thought[^>]*>(.*?)<\/thought>/gs,
    /<internal[^>]*>(.*?)<\/internal>/gs
  ];

  let cleanedText = text;

  tagPatternsToRemove.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, (_, content) => {
      return content ? content.trim() : '';
    });
  });

  return cleanedText.trim();
};

// Simple markdown parser for bold and italic text
const parseMarkdown = (text: string): React.ReactNode => {
  if (!text) return text;

  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
};

// Component to display streaming LLM responses and tool calls in real-time
const StreamingDisplay: React.FC<{
  content: {
    llm_responses: LLMResponse[];
    tool_calls: ToolCall[];
  } | null;
  isRunning: boolean;
}> = ({ content, isRunning }) => {
  const [copiedItems, setCopiedItems] = React.useState<Set<string>>(new Set());
  const [tallResponses, setTallResponses] = React.useState<Set<string>>(new Set());
  const responseRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  React.useEffect(() => {
    const checkHeights = () => {
      const newTallResponses = new Set<string>();
      responseRefs.current.forEach((element, key) => {
        if (element && element.scrollHeight > 400) {
          newTallResponses.add(key);
        }
      });
      setTallResponses(newTallResponses);
    };

    const timeoutId = setTimeout(checkHeights, 100);
    return () => clearTimeout(timeoutId);
  }, [content]);

  if (!content) return null;

  const { llm_responses, tool_calls } = content;

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set([...prev, itemId]));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const chronologicalEvents = [
    ...llm_responses.map((response, index) => ({
      type: 'llm_response' as const,
      data: response,
      round: response.round,
      timestamp: new Date(response.timestamp).getTime(),
      sortKey: `${response.round}-1-${index}`
    })),
    ...tool_calls.map((toolCall) => ({
      type: 'tool_call' as const,
      data: toolCall,
      round: toolCall.round,
      timestamp: new Date(toolCall.timestamp).getTime(),
      sortKey: `${toolCall.round}-0-${toolCall.call_index}`
    }))
  ].sort((a, b) => {
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    return a.sortKey.localeCompare(b.sortKey);
  });

  return (
    <div className="space-y-3">
      {chronologicalEvents.map((event, index) => {
        const responseId = `llm-${event.data.round}-${index}`;

        return (
          <div key={`${event.type}-${index}`} className="relative group">
            {event.type === 'llm_response' ? (
              <div
                ref={(el) => {
                  if (el) {
                    responseRefs.current.set(responseId, el);
                  } else {
                    responseRefs.current.delete(responseId);
                  }
                }}
                className={`text-sm border rounded-lg p-4 shadow-sm relative group ${
                  (event.data as LLMResponse).isEmpty
                    ? 'bg-yellow-50/70 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/60'
                    : 'bg-card border-border'
                }`}
              >
                <button
                  onClick={() => copyToClipboard(cleanContent((event.data as LLMResponse).content), `llm-${event.data.round}-${index}`)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded z-10"
                  title="Copy response"
                >
                  {copiedItems.has(`llm-${event.data.round}-${index}`) ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>

                <div className={`whitespace-pre-wrap leading-relaxed pr-8 ${
                  (event.data as LLMResponse).isEmpty
                    ? 'text-yellow-800 italic'
                    : 'text-foreground'
                }`}>
                  {parseMarkdown(cleanContent((event.data as LLMResponse).content))}
                </div>
                {(event.data as LLMResponse).model_used && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {(event.data as LLMResponse).model_used} • Round {event.data.round}
                    {(event.data as LLMResponse).isEmpty && ' • Empty Response'}
                  </div>
                )}

                {tallResponses.has(responseId) && (
                  <button
                    onClick={() => copyToClipboard(cleanContent((event.data as LLMResponse).content), `llm-${event.data.round}-${index}-bottom`)}
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded bg-background/80 backdrop-blur-sm border border-border z-10"
                    title="Copy response"
                  >
                    {copiedItems.has(`llm-${event.data.round}-${index}-bottom`) ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-lg p-3 shadow-sm relative group">
                <button
                  onClick={() => {
                    const toolData = event.data as ToolCall;
                    const toolInfo = `Tool: ${toolData.tool_name}\nStatus: ${toolData.status}\nRound: ${toolData.round}\nCall: ${toolData.call_index}`;
                    copyToClipboard(toolInfo, `tool-${toolData.round}-${toolData.call_index}-${index}`);
                  }}
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded"
                  title="Copy tool info"
                >
                  {copiedItems.has(`tool-${(event.data as ToolCall).round}-${(event.data as ToolCall).call_index}-${index}`) ? (
                    <Check className="h-3 w-3 text-green-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-blue-600" />
                  )}
                </button>

                <div className="flex items-center gap-2 pr-6">
                  {(event.data as ToolCall).status === 'started' && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                  )}
                  {(event.data as ToolCall).status === 'completed' && (
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  )}
                  {(event.data as ToolCall).status === 'failed' && (
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                  )}
                  <span className="font-medium text-blue-700 dark:text-blue-200">
                    {(event.data as ToolCall).tool_name}
                  </span>
                  <span className="text-blue-600 dark:text-blue-300">
                    ({(event.data as ToolCall).status === 'started' ? 'Running...' :
                      (event.data as ToolCall).status === 'completed' ? 'Completed' : 'Failed'})
                  </span>
                </div>
                <div className="text-blue-600 mt-1">
                  Round {(event.data as ToolCall).round} • Call {(event.data as ToolCall).call_index}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {isRunning && (
        <div className="text-xs bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-lg p-3">
          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-200">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Custom node component for flow steps
export const FlowStepNode: React.FC<{ data: FlowStepNodeData }> = ({ data }) => {
  const [editData, setEditData] = useState(data);
  const [showOutput, setShowOutput] = useState(false);

  React.useEffect(() => {
    setEditData(data);
  }, [data.id, data.name, data.description, data.system_prompt, data.agent_id, data.variables]);

  const getAgent = (agentId: string | undefined) => {
    if (!agentId || !data.agents) return null;
    return data.agents.find(agent => agent.id === agentId);
  };

  const selectedAgent = getAgent(editData.agent_id);

  const getStatusIndicator = () => {
    if (data.isCompleted) {
      return <div className="w-3 h-3 rounded-full status-indicator-completed" />;
    }
    if (data.isRunning) {
      return <div className="w-3 h-3 rounded-full status-indicator-running" />;
    }
    if (data.isStart) {
      return <div className="w-3 h-3 rounded-full status-indicator-start" />;
    }
    return <Circle className="w-3 h-3 text-gray-400" />;
  };

  const getStepOutput = React.useMemo(() => {
    if (!data.isCompleted && !data.isRunning) return null;

    const stepData = data.stepOutputs?.[data.id];
    if (stepData) {
      const hasFeedbackIterations = stepData.feedback_iterations && stepData.feedback_iterations.length > 0;
      if (hasFeedbackIterations) {
        return 'FEEDBACK_ITERATIONS';
      }

      const hasStreamingContent = (stepData.llm_responses && stepData.llm_responses.length > 0) ||
                                 (stepData.tool_calls && stepData.tool_calls.length > 0);

      if (data.isCompleted && hasStreamingContent) {
        return 'STREAMING_COMPLETED';
      }

      if (data.isCompleted && stepData.final_output) {
        return stepData.final_output;
      }

      if (data.isRunning && hasStreamingContent) {
        return 'STREAMING';
      }

      if (stepData.final_output) {
        return stepData.final_output;
      }
    }

    if (data.isRunning) {
      return 'LOADING';
    }

    if (data.isCompleted) {
      return "No output received from this step.";
    }

    return null;
  }, [data.isCompleted, data.isRunning, data.stepOutputs, data.id]);

  const getStreamingContent = () => {
    if (!data.stepOutputs || !data.stepOutputs[data.id]) return null;
    const stepData = data.stepOutputs[data.id];

    return {
      llm_responses: stepData.llm_responses || [],
      tool_calls: stepData.tool_calls || []
    };
  };

  const getNodeGradientClass = () => {
    if (data.isRunning) return 'flow-node-gradient-running flow-node-running-glow';
    if (data.isCompleted) return 'flow-node-gradient-completed status-completed-celebrate';
    if (data.isStart) return 'flow-node-gradient-start';
    return 'flow-node-gradient-idle float-animation';
  };

  const getBorderColor = () => {
    if (data.isRunning) return 'border-l-4 border-l-purple-500';
    if (data.isCompleted) return 'border-l-4 border-l-green-500';
    if (data.isStart) return 'border-l-4 border-l-blue-500';
    return 'border-l-4 border-l-transparent';
  };

  return (
    <div
      className={`group relative rounded-2xl w-[340px] transition-all duration-300 cursor-pointer
        flow-node-glass ${getNodeGradientClass()} ${getBorderColor()}
        shadow-md hover:shadow-xl ${
        data.isRunning
          ? 'border-purple-400/50'
          : data.isCompleted
          ? 'border-green-400/50'
          : 'border-border hover:border-purple-300/50'
      }`}
      style={{
        outline: data.isSelected ? '2px solid #a855f7' : undefined,
      }}
      onClick={data.onEdit}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          top: '50%',
          left: '-8px',
          width: '16px',
          height: '16px',
          backgroundColor: '#ffffff',
          border: '2px solid #64748b',
          borderRadius: '50%',
          transition: 'all 0.2s ease',
        }}
        className="flow-handle flow-handle-target hover:!border-purple-500 hover:!bg-purple-50"
        id="left"
      />

      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        {(data.isCompleted || data.isRunning) && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setShowOutput(!showOutput);
            }}
            className="h-7 w-7 p-0 bg-background/95 hover:bg-muted border-border hover:border-purple-400 shadow-sm"
            title={showOutput ? "Hide output" : "Show output"}
          >
            {showOutput ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          {data.type === 'approval' ? (
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg ${
                data.isRunning ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse' : ''
              }`}>
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
            </div>
          ) : selectedAgent && selectedAgent.avatar_url ? (
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-xl overflow-hidden shadow-lg transition-all bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 ${
                data.isRunning
                  ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-background'
                  : data.isCompleted
                  ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-background'
                  : 'ring-2 ring-border/50'
              }`}>
                <img
                  src={selectedAgent.avatar_url}
                  alt={selectedAgent.name}
                  className="w-full h-full object-contain avatar-glow"
                  style={{ mixBlendMode: 'multiply' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-purple-500 rounded-full p-1 shadow-md">
                <Sparkles className={`h-3 w-3 text-white ${
                  data.isRunning ? 'sparkle-enhanced' : 'sparkle-icon'
                }`} />
              </div>
            </div>
          ) : (
            <div className="relative flex-shrink-0">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg ${
                data.isRunning ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-background' : 'ring-2 ring-border/50'
              }`}>
                <Sparkles className={`h-6 w-6 text-white ${
                  data.isRunning ? 'sparkle-enhanced' : 'sparkle-icon'
                }`} />
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate mb-1.5 text-foreground" title={editData.name}>
              {editData.name || 'Unnamed Step'}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {data.type === 'approval' ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md">
                  <UserCheck className="h-3 w-3" />
                  Approval Required
                </span>
              ) : selectedAgent ? (
                <>
                  <span className="text-xs font-medium text-muted-foreground truncate max-w-[140px]" title={selectedAgent.name}>
                    {selectedAgent.name}
                  </span>
                  <span className="text-xs text-muted-foreground/50">•</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${
                    data.isRunning
                      ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30'
                      : data.isCompleted
                      ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
                      : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30'
                  }`}>
                    {getStatusIndicator()}
                    {data.isRunning ? 'Running' : data.isCompleted ? 'Done' : 'Ready'}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  No agent assigned
                </span>
              )}
            </div>
          </div>
        </div>

        {showOutput && getStepOutput && (
          <div className="pt-3 mt-3 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {data.isRunning ? "Processing..." : "Output"}
            </div>
            <div
              className="nowheel space-y-2 max-h-[300px] overflow-y-auto scrollbar bg-gray-50/50 dark:bg-gray-900/30 rounded-md p-2"
            >
              {getStepOutput === 'LOADING' ? (
                <div className="text-xs bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-lg p-2">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-200">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Generating...</span>
                  </div>
                </div>
              ) : getStepOutput === 'STREAMING' ? (
                <StreamingDisplay
                  content={getStreamingContent()}
                  isRunning={data.isRunning ?? false}
                />
              ) : getStepOutput === 'STREAMING_COMPLETED' ? (
                <StreamingDisplay
                  content={getStreamingContent()}
                  isRunning={false}
                />
              ) : getStepOutput === 'FEEDBACK_ITERATIONS' ? (
                <div className="space-y-2">
                  {(() => {
                    const currentStepOutput = data.stepOutputs?.[data.id] || {};
                    return (
                      <>
                        {currentStepOutput.final_output && (
                          <div className="border-b border-gray-100 dark:border-gray-800 pb-2">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Initial Output
                            </div>
                            <AgentOutput
                              output={currentStepOutput.final_output}
                            />
                          </div>
                        )}

                        {currentStepOutput.feedback_iterations?.filter((iteration: FeedbackIteration) => {
                          const currentStepName = data.name || data.id;
                          return iteration.stepName === currentStepName;
                        }).map((iteration: FeedbackIteration, index: number) => (
                          <div key={`${iteration.iteration}-${iteration.role}-${index}`} className="space-y-1">
                            <div className="text-xs font-medium flex items-center gap-2 text-purple-700 dark:text-purple-300">
                              <span className="bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded text-xs">
                                {iteration.role === 'assessor' ? 'Assessment' : 'Improvement'} #{iteration.iteration}
                              </span>
                            </div>
                            <div className="bg-purple-50/30 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-800/30 rounded-lg p-2">
                              <AgentOutput
                                output={iteration.output}
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="nodrag text-xs">
                  <AgentOutput
                    output={getStepOutput || ''}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          top: '50%',
          right: '-8px',
          width: '16px',
          height: '16px',
          backgroundColor: '#ffffff',
          border: '2px solid #64748b',
          borderRadius: '50%',
          transition: 'all 0.2s ease',
        }}
        className="flow-handle flow-handle-source hover:!border-purple-500 hover:!bg-purple-50"
        id="right"
      />
    </div>
  );
};
