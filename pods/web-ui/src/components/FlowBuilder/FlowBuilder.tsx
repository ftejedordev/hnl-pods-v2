import React, { useState, useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  type Node,
  type Edge,
  type Connection,
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Background,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './flow.css';
import type { FlowStep, EdgeMetadata } from '../../types/flow';
import type { Agent } from '../../types/agent';
import type { LLM } from '../../types/llm';
import type { McpServerConnection } from '../../types/mcp';
import { Play, Circle, Eye, EyeOff, Loader2, Copy, Check, Square, Sparkles, ArrowLeft, AlertTriangle, UserCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { FlowPropertiesPanel } from './FlowPropertiesPanel';
import { useToast } from '../ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { AgentOutput } from '../common/AgentOutput';
import { AgentResponsesPanel } from './AgentResponsesPanel';
import { agentsApi } from '../../api/agents';
import { llmsApi } from '../../api/llms';
import { mcpServerConnectionsApi } from '../../api/mcpServerConnections';
import { flowsApi, executionsApi, type SSEConnection } from '../../api/flows';
import { FeedbackLoopEdgeComponent } from './FeedbackLoopEdge';
import { FeedbackLoopModal, type BidirectionalFeedbackLoopConfig } from './FeedbackLoopModal';
import { ApprovalModal } from './ApprovalModal';
import { CustomEdge } from './CustomEdge';
import TrashDropZone from './TrashDropZone';
import NodeContextMenu from './NodeContextMenu';

interface FlowBuilderProps {
  steps: FlowStep[];
  onStepsChange: (steps: FlowStep[]) => void;
  edgeMetadata: Record<string, EdgeMetadata>;
  onEdgeMetadataChange: (edgeMetadata: Record<string, EdgeMetadata>) => void;
  startStepId: string;
  onStartStepChange: (stepId: string) => void;
  variables?: Record<string, any>;
  flowId?: string;
  flowName?: string;

  // Flow properties for panel
  flowDescription: string;
  hasUnsavedChanges: boolean;
  saving: boolean;
  isEditMode: boolean;
  onFlowNameChange: (name: string) => void;
  onFlowDescriptionChange: (description: string) => void;
  onVariableUpdate: (oldKey: string, newKey: string, newValue: string) => void;
  onVariableDelete: (key: string) => void;
  onAddVariable: () => void;
  onSave: () => void;
  onCancel: () => void;
}

interface FlowExecution {
  isRunning: boolean;
  currentStepId: string | null;
  completedSteps: Set<string>;
  runningSteps: Set<string>;
  stepCompletionCallbacks: Map<string, () => void>;
}

// Function to clean content by removing unwanted HTML tags
const cleanContent = (text: string): string => {
  if (!text) return text;
  
  // Remove common LLM wrapper tags like <answer>, <think>, <reasoning>, etc.
  const tagPatternsToRemove = [
    /<answer[^>]*>(.*?)<\/answer>/gs,
    /<think[^>]*>(.*?)<\/think>/gs,
    /<reasoning[^>]*>(.*?)<\/reasoning>/gs,
    /<thought[^>]*>(.*?)<\/thought>/gs,
    /<internal[^>]*>(.*?)<\/internal>/gs
  ];
  
  let cleanedText = text;
  
  // For each pattern, extract the content inside the tags
  tagPatternsToRemove.forEach(pattern => {
    cleanedText = cleanedText.replace(pattern, (_, content) => {
      // Return just the content inside the tags, trimmed
      return content ? content.trim() : '';
    });
  });
  
  return cleanedText.trim();
};

// Simple markdown parser for bold and italic text
const parseMarkdown = (text: string): React.ReactNode => {
  if (!text) return text;
  
  // Split text by markdown patterns while preserving the markers
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  
  return parts.map((part, index) => {
    // Bold text **text**
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    // Italic text *text* (but not bold)
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    // Regular text
    return part;
  });
};

// Component to display streaming LLM responses and tool calls in real-time
const StreamingDisplay: React.FC<{
  content: {
    llm_responses: Array<{
      content: string;
      round: number;
      tool_calls?: any;
      model_used?: string;
      timestamp: string;
      isEmpty?: boolean;
    }>;
    tool_calls: Array<{
      tool_name: string;
      status: 'started' | 'completed' | 'failed';
      round: number;
      call_index: number;
      timestamp: string;
      result?: any;
    }>;
  } | null;
  isRunning: boolean;
}> = ({ content, isRunning }) => {
  const [copiedItems, setCopiedItems] = React.useState<Set<string>>(new Set());
  const [tallResponses, setTallResponses] = React.useState<Set<string>>(new Set());
  const responseRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  // Check height of response boxes to determine if we should show bottom copy button
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

    // Check heights after content renders
    const timeoutId = setTimeout(checkHeights, 100);
    return () => clearTimeout(timeoutId);
  }, [content]);

  if (!content) return null;

  const { llm_responses, tool_calls } = content;

  // Copy to clipboard function
  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set([...prev, itemId]));
      // Reset copied state after 2 seconds
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

  // Merge and sort LLM responses and tool calls chronologically
  const chronologicalEvents = [
    ...llm_responses.map((response, index) => ({
      type: 'llm_response' as const,
      data: response,
      round: response.round,
      timestamp: new Date(response.timestamp).getTime(),
      sortKey: `${response.round}-1-${index}` // LLM responses come AFTER tool calls in same round
    })),
    ...tool_calls.map((toolCall) => ({
      type: 'tool_call' as const,
      data: toolCall,
      round: toolCall.round,
      timestamp: new Date(toolCall.timestamp).getTime(),
      sortKey: `${toolCall.round}-0-${toolCall.call_index}` // Tool calls come BEFORE LLM responses
    }))
  ].sort((a, b) => {
    // Sort by round first, then by type (tool calls before LLM responses), then by call_index/timestamp
    if (a.round !== b.round) {
      return a.round - b.round;
    }
    return a.sortKey.localeCompare(b.sortKey);
  });

  return (
    <div className="space-y-3">
      {/* Display events in chronological order */}
      {chronologicalEvents.map((event, index) => {
        const responseId = `llm-${event.data.round}-${index}`;
        
        return (
          <div key={`${event.type}-${index}`} className="relative group">
            {event.type === 'llm_response' ? (
              /* LLM Response Display */
              <div 
                ref={(el) => {
                  if (el) {
                    responseRefs.current.set(responseId, el);
                  } else {
                    responseRefs.current.delete(responseId);
                  }
                }}
                className={`text-sm border rounded-lg p-4 shadow-sm relative group ${
                  event.data.isEmpty 
                    ? 'bg-yellow-50/70 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/60' 
                    : 'bg-card border-border'
                }`}
              >
                {/* Top Copy Button */}
                <button
                  onClick={() => copyToClipboard(cleanContent(event.data.content), `llm-${event.data.round}-${index}`)}
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
                  event.data.isEmpty 
                    ? 'text-yellow-800 italic' 
                    : 'text-foreground'
                }`}>
                  {parseMarkdown(cleanContent(event.data.content))}
                </div>
                {event.data.model_used && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {event.data.model_used} • Round {event.data.round}
                    {event.data.isEmpty && ' • Empty Response'}
                  </div>
                )}
                
                {/* Bottom Copy Button - only show if content is tall enough */}
                {tallResponses.has(responseId) && (
                  <button
                    onClick={() => copyToClipboard(cleanContent(event.data.content), `llm-${event.data.round}-${index}-bottom`)}
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
            /* Tool Call Display */
            <div className="text-xs bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-lg p-3 shadow-sm relative group">
              {/* Copy Button for Tool Calls */}
              <button
                onClick={() => {
                  const toolInfo = `Tool: ${event.data.tool_name}\nStatus: ${event.data.status}\nRound: ${event.data.round}\nCall: ${event.data.call_index}`;
                  copyToClipboard(toolInfo, `tool-${event.data.round}-${event.data.call_index}-${index}`);
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded"
                title="Copy tool info"
              >
                {copiedItems.has(`tool-${event.data.round}-${event.data.call_index}-${index}`) ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3 text-blue-600" />
                )}
              </button>
              
              <div className="flex items-center gap-2 pr-6">
                {event.data.status === 'started' && (
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                )}
                {event.data.status === 'completed' && (
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                )}
                {event.data.status === 'failed' && (
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                )}
                <span className="font-medium text-blue-700 dark:text-blue-200">
                  {event.data.tool_name}
                </span>
                <span className="text-blue-600 dark:text-blue-300">
                  ({event.data.status === 'started' ? 'Running...' : 
                    event.data.status === 'completed' ? 'Completed' : 'Failed'})
                </span>
              </div>
              <div className="text-blue-600 mt-1">
                Round {event.data.round} • Call {event.data.call_index}
              </div>
            </div>
          )}
          </div>
        );
      })}

      {/* Show current status if step is still running */}
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
const FlowStepNode: React.FC<{ 
  data: FlowStep & { 
    onEdit: () => void; 
    onDelete: () => void; 
    onPlay?: () => void;
    isStart: boolean;
    isRunning?: boolean;
    isCompleted?: boolean;
    onUpdateStep: (step: FlowStep) => void;
    isNewStep?: boolean;
    variables?: Record<string, any>;
    onStepComplete?: (stepId: string) => void;
    agents?: Agent[];
    llms?: LLM[];
    mcpConnections?: McpServerConnection[];
    mcpToolCounts?: Record<string, number>;
    agentsLoading?: boolean;
    stepOutputs?: Record<string, {
      llm_responses?: Array<{
        content: string;
        round: number;
        tool_calls?: any;
        model_used?: string;
        timestamp: string;
        isEmpty?: boolean;
      }>;
      tool_calls?: Array<{
        tool_name: string;
        status: 'started' | 'completed' | 'failed';
        round: number;
        call_index: number;
        timestamp: string;
        result?: any;
      }>;
      feedback_iterations?: Array<{
        iteration: number;
        role: 'assessor' | 'improver';
        output: string;
        timestamp: string;
        stepName: string;
      }>;
      final_output?: string;
    }>;
  } 
}> = ({ data }) => {
  const [editData, setEditData] = useState(data);
  const [showOutput, setShowOutput] = useState(false);

  // Sync editData with incoming data changes
  React.useEffect(() => {
    setEditData(data);
  }, [data.id, data.name, data.description, data.system_prompt, data.agent_id, data.variables]);

  // Helper function to get agent by ID
  const getAgent = (agentId: string | undefined) => {
    if (!agentId || !data.agents) return null;
    return data.agents.find(agent => agent.id === agentId);
  };

  // Get the selected agent
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
  

  // Get the real output for this step, show streaming data while generating, null if not started
  const getStepOutput = React.useMemo(() => {
    // If step hasn't started yet, don't show anything
    if (!data.isCompleted && !data.isRunning) return null;
    
    // If we have step output data from SSE events
    const stepData = data.stepOutputs?.[data.id];
    if (stepData) {
      // Temporarily disable debug logging to reduce noise
      // console.log(`🔍 DEBUG: getStepOutput for step ${data.id} (${data.name}):`, {
      //   hasFeedbackIterations: (stepData.feedback_iterations?.length || 0) > 0,
      //   feedbackIterationsCount: stepData.feedback_iterations?.length || 0,
      //   hasLlmResponses: (stepData.llm_responses?.length || 0) > 0,
      //   llmResponsesCount: stepData.llm_responses?.length || 0,
      //   hasFinalOutput: !!stepData.final_output,
      //   isCompleted: data.isCompleted,
      //   isRunning: data.isRunning
      // });
      
      // Check for feedback loop iterations first
      const hasFeedbackIterations = stepData.feedback_iterations && stepData.feedback_iterations.length > 0;
      if (hasFeedbackIterations) {
        return 'FEEDBACK_ITERATIONS'; // Special marker for feedback display
      }
      
      const hasStreamingContent = (stepData.llm_responses && stepData.llm_responses.length > 0) || 
                                 (stepData.tool_calls && stepData.tool_calls.length > 0);
      
      // If step is completed AND we have streaming history, show streaming display
      if (data.isCompleted && hasStreamingContent) {
        return 'STREAMING_COMPLETED'; // Special marker for completed streaming display
      }
      
      // If step is completed but no streaming data, show final output only
      if (data.isCompleted && stepData.final_output) {
        return stepData.final_output;
      }
      
      // If step is running and we have streaming data, show streaming display immediately
      if (data.isRunning && hasStreamingContent) {
        return 'STREAMING'; // Special marker for streaming display
      }
      
      // If step is running and has final output (edge case), show it
      if (stepData.final_output) {
        return stepData.final_output;
      }
    }
    
    // If step is running but no output yet, show loader
    if (data.isRunning) {
      return 'LOADING'; // Special marker for loader
    }
    
    // If step is completed but no output (shouldn't happen), show placeholder
    if (data.isCompleted) {
      return "No output received from this step.";
    }
    
    return null;
  }, [data.isCompleted, data.isRunning, data.stepOutputs, data.id, data.name]);

  // Get streaming content for display during execution
  const getStreamingContent = () => {
    if (!data.stepOutputs || !data.stepOutputs[data.id]) return null;
    const stepData = data.stepOutputs[data.id];
    
    return {
      llm_responses: stepData.llm_responses || [],
      tool_calls: stepData.tool_calls || []
    };
  };
  
  // Determine node gradient class based on state
  const getNodeGradientClass = () => {
    if (data.isRunning) return 'flow-node-gradient-running flow-node-running-glow';
    if (data.isCompleted) return 'flow-node-gradient-completed status-completed-celebrate';
    if (data.isStart) return 'flow-node-gradient-start';
    return 'flow-node-gradient-idle float-animation';
  };

  // Get border color based on state
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

      {/* Action buttons in top-right corner - accessible on hover */}
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
        {/* Premium header with large square avatar */}
        <div className="flex items-start gap-4">
          {/* Avatar section - large square with rounded corners */}
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
              {/* Sparkle badge on avatar */}
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

          {/* Content section */}
          <div className="flex-1 min-w-0">
            {/* Step name */}
            <div className="font-bold text-base truncate mb-1.5 text-foreground" title={editData.name}>
              {editData.name || 'Unnamed Step'}
            </div>

            {/* Agent info and status in one line */}
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

        {/* Output section - shown when execution output is available */}
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

                        {currentStepOutput.feedback_iterations?.filter((iteration: {
                          iteration: number;
                          role: 'assessor' | 'improver';
                          output: string;
                          timestamp: string;
                          stepName: string;
                        }) => {
                          const currentStepName = data.name || data.id;
                          return iteration.stepName === currentStepName;
                        }).map((iteration: {
                          iteration: number;
                          role: 'assessor' | 'improver';
                          output: string;
                          timestamp: string;
                          stepName: string;
                        }, index: number) => (
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

const nodeTypes: NodeTypes = {
  flowStep: FlowStepNode,
};

const edgeTypes: EdgeTypes = {
  customDefault: CustomEdge,
  feedbackLoop: FeedbackLoopEdgeComponent,
};

export const FlowBuilder: React.FC<FlowBuilderProps> = ({
  steps,
  onStepsChange,
  edgeMetadata,
  onEdgeMetadataChange,
  startStepId,
  onStartStepChange,
  variables = {},
  flowId,
  flowName,
  flowDescription,
  hasUnsavedChanges,
  saving,
  isEditMode,
  onFlowNameChange,
  onFlowDescriptionChange,
  onVariableUpdate,
  onVariableDelete,
  onAddVariable,
  onSave,
  onCancel
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const initialNodes: Node[] = [];
  const initialEdges: Edge[] = [];
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<FlowStep | null>(null);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [execution, setExecution] = useState<FlowExecution>({
    isRunning: false,
    currentStepId: null,
    completedSteps: new Set(),
    runningSteps: new Set(),
    stepCompletionCallbacks: new Map()
  });
  
  // Store real step outputs from SSE events
  const [stepOutputs, setStepOutputs] = useState<Record<string, {
    llm_responses?: Array<{
      content: string;
      round: number;
      tool_calls?: any;
      model_used?: string;
      timestamp: string;
      isEmpty?: boolean;
    }>;
    tool_calls?: Array<{
      tool_name: string;
      status: 'started' | 'completed' | 'failed';
      round: number;
      call_index: number;
      timestamp: string;
      result?: any;
    }>;
    feedback_iterations?: Array<{
      iteration: number;
      role: 'assessor' | 'improver';
      output: string;
      timestamp: string;
      stepName: string;
    }>;
    final_output?: string;
    streaming_content?: Record<number, string>;
    streaming_active?: boolean;
  }>>({});
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [eventSource, setEventSource] = useState<SSEConnection | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [shownToasts, setShownToasts] = useState<Set<string>>(new Set()); // Track which toasts we've already shown
  const [newlyCreatedSteps, setNewlyCreatedSteps] = useState<Set<string>>(new Set());
  // Use ref instead of state to avoid unnecessary re-renders and callback recreation
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  // Track executions that have finished to prevent reconnection
  const finishedExecutionsRef = useRef<Set<string>>(new Set());
  
  // Bidirectional feedback loop state
  const [feedbackLoopConfig, setFeedbackLoopConfig] = useState<BidirectionalFeedbackLoopConfig | null>(null);
  const [showFeedbackLoopModal, setShowFeedbackLoopModal] = useState(false);
  const [feedbackLoopState, setFeedbackLoopState] = useState<Record<string, {
    isActive: boolean;
    currentIteration: number;
    maxIterations: number;
    sourceStepId: string;
    targetStepId: string;
  }>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [llms, setLlms] = useState<LLM[]>([]);

  // Agent responses panel state
  const [agentResponses, setAgentResponses] = useState<Array<{
    stepId: string;
    stepName: string;
    agentName: string;
    agentAvatar?: string;
    agentColor?: string;
    output: string;
    timestamp: Date;
    status?: 'completed' | 'running' | 'failed' | 'streaming';
    round?: number;
  }>>([]);
  const [showResponsesPanel, setShowResponsesPanel] = useState(false);
  const [mcpConnections, setMcpConnections] = useState<McpServerConnection[]>([]);
  const [mcpToolCounts, setMcpToolCounts] = useState<Record<string, number>>({});
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [nodeContextMenu, setNodeContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [, setDraggedNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const flowRef = React.useRef<HTMLDivElement>(null);
  const trashZoneRef = React.useRef<HTMLDivElement>(null);
  const connectToExecutionRef = React.useRef<((executionId: string, isNewExecution?: boolean) => void) | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<string | null>(null);

  // Approval modal state
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalData, setApprovalData] = useState<{
    stepId: string;
    stepName: string;
    approvalMessage: string;
    content: string;
  } | null>(null);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);

  // Bidirectional feedback loop handlers
  const handleConfigureFeedbackLoop = useCallback((edgeId: string) => {
    const [sourceId, targetId] = edgeId.split('-');
    const existingEdgeMetadata = edgeMetadata[edgeId];
    
    setFeedbackLoopConfig({
      edgeId,
      sourceStepId: sourceId,
      targetStepId: targetId,
      maxIterations: existingEdgeMetadata?.max_iterations || 25,
      qualityThreshold: existingEdgeMetadata?.quality_threshold || 0.8,
      convergenceCriteria: existingEdgeMetadata?.convergence_criteria,
    });
    setShowFeedbackLoopModal(true);
  }, [edgeMetadata]);

  const handleConvertToFeedbackLoop = useCallback((edgeId: string) => {
    const [sourceId, targetId] = edgeId.split('-');

    setFeedbackLoopConfig({
      edgeId,
      sourceStepId: sourceId,
      targetStepId: targetId,
      maxIterations: 25,
      qualityThreshold: 0.8,
    });
    setShowFeedbackLoopModal(true);
  }, []);

  // Approval handlers
  const handleApprove = useCallback(async () => {
    if (!currentExecutionId || !approvalData) return;

    setApprovalSubmitting(true);
    try {
      await executionsApi.submitApproval(currentExecutionId, true);
      toast({
        title: "Approval Granted",
        description: "Continuing flow execution...",
      });
      setApprovalModalOpen(false);
      setApprovalData(null);
    } catch (error) {
      console.error('Error submitting approval:', error);
      toast({
        title: "Error",
        description: "Failed to submit approval",
        variant: "destructive"
      });
    } finally {
      setApprovalSubmitting(false);
    }
  }, [currentExecutionId, approvalData, toast]);

  const handleReject = useCallback(async () => {
    if (!currentExecutionId || !approvalData) return;

    setApprovalSubmitting(true);
    try {
      await executionsApi.submitApproval(currentExecutionId, false);
      toast({
        title: "Approval Rejected",
        description: "Retrying previous step...",
      });
      setApprovalModalOpen(false);
      setApprovalData(null);
    } catch (error) {
      console.error('Error submitting rejection:', error);
      toast({
        title: "Error",
        description: "Failed to submit rejection",
        variant: "destructive"
      });
    } finally {
      setApprovalSubmitting(false);
    }
  }, [currentExecutionId, approvalData, toast]);

  const handleRemoveFeedbackLoop = useCallback((edgeId: string) => {
    // Remove edge metadata for this feedback loop
    const updatedEdgeMetadata = { ...edgeMetadata };
    delete updatedEdgeMetadata[edgeId];
    
    onEdgeMetadataChange(updatedEdgeMetadata);
    
    toast({
      title: "Bidirectional Feedback Loop Removed",
      description: "The feedback loop has been removed from this connection.",
    });
  }, [edgeMetadata, onEdgeMetadataChange, toast]);

  const handleSaveFeedbackLoop = useCallback((config: BidirectionalFeedbackLoopConfig) => {
    // Create/update edge metadata for this feedback loop
    const updatedEdgeMetadata = {
      ...edgeMetadata,
      [config.edgeId]: {
        edge_id: config.edgeId,
        source_step_id: config.sourceStepId,
        target_step_id: config.targetStepId,
        is_feedback_loop: true,
        max_iterations: config.maxIterations,
        quality_threshold: config.qualityThreshold,
        convergence_criteria: config.convergenceCriteria,
        current_iteration: 0,
        feedback_history: [],
        quality_scores: [],
      },
    };
    
    onEdgeMetadataChange(updatedEdgeMetadata);
    setShowFeedbackLoopModal(false);
    setFeedbackLoopConfig(null);
    
    toast({
      title: "Bidirectional Feedback Loop Configured",
      description: "The feedback loop has been successfully configured.",
    });
  }, [edgeMetadata, onEdgeMetadataChange, toast]);

  // Load agents, LLMs, and MCP connections on component mount
  useEffect(() => {
    loadAgents();
    loadLlms();
    loadMcpConnections();
  }, []);

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const agentsData = await agentsApi.getAgents();
      setAgents(agentsData);
    } catch (error) {
      console.error('Error loading agents:', error);
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  };

  const loadLlms = async () => {
    try {
      const response = await llmsApi.getLLMs();
      setLlms(response.llms.filter(llm => llm.status === 'active'));
    } catch (error) {
      console.error('Error loading LLMs:', error);
      setLlms([]);
    }
  };

  const loadMcpConnections = async () => {
    try {
      const connections = await mcpServerConnectionsApi.getAll();
      const activeConnections = connections.filter(conn => conn.is_active);
      setMcpConnections(activeConnections);
      
      // Load tool counts for each connection
      const toolCounts: Record<string, number> = {};
      for (const conn of activeConnections) {
        try {
          const toolsResponse = await mcpServerConnectionsApi.getTools(conn.id);
          toolCounts[conn.id] = toolsResponse.total_tools || 0;
        } catch (error) {
          console.error(`Error loading tools for connection ${conn.id}:`, error);
          toolCounts[conn.id] = 0;
        }
      }
      setMcpToolCounts(toolCounts);
    } catch (error) {
      console.error('Error loading MCP connections:', error);
      setMcpConnections([]);
    }
  };

  // Convert steps to nodes and edges
  useEffect(() => {
    setNodes((currentNodes) => {
      // Defensive check: Don't clear nodes if steps array is empty but we have existing nodes
      if (steps.length === 0 && currentNodes.length > 0) {
        return currentNodes; // Preserve existing nodes
      }

      // Create a map of current nodes for faster lookup
      const currentNodesMap = new Map(currentNodes.map(node => [node.id, node]));

      const newNodes: Node[] = steps.map(step => {
        // Find existing node to preserve position and internal state
        const existingNode = currentNodesMap.get(step.id);
        const preservedPosition = existingNode ? existingNode.position : step.position;

        // If node exists and we're just updating data, preserve more state
        if (existingNode) {
          return {
            ...existingNode,
            position: preservedPosition,
            hidden: false,
            data: {
              ...step,
              isStart: step.id === startStepId,
              isRunning: execution.runningSteps.has(step.id),
              isCompleted: execution.completedSteps.has(step.id),
              isNewStep: newlyCreatedSteps.has(step.id),
              variables: variables,
              agents: agents,
              llms: llms,
              mcpConnections: mcpConnections,
              mcpToolCounts: mcpToolCounts,
              agentsLoading: agentsLoading,
              stepOutputs: stepOutputs,
              onEdit: () => {
                setSelectedNode(step);
                setShowPropertiesPanel(true);
              },
              onDelete: () => deleteStep(step.id),
              onPlay: step.id === startStepId && !execution.isRunning ? () => runWorkflow() : undefined,
              onUpdateStep: (updatedStep: FlowStep) => updateStep(updatedStep),
              onStepComplete: handleStepComplete
            }
          };
        }

        // Create new node for new steps
        return {
          id: step.id,
          type: 'flowStep',
          position: preservedPosition,
          hidden: false,
          data: {
            ...step,
            isStart: step.id === startStepId,
            isRunning: execution.runningSteps.has(step.id),
            isCompleted: execution.completedSteps.has(step.id),
            isNewStep: newlyCreatedSteps.has(step.id),
            variables: variables,
            agents: agents,
            llms: llms,
            mcpConnections: mcpConnections,
            mcpToolCounts: mcpToolCounts,
            agentsLoading: agentsLoading,
            stepOutputs: stepOutputs,
            onEdit: () => {
              setSelectedNode(step);
              setShowPropertiesPanel(true);
            },
            onDelete: () => deleteStep(step.id),
            onPlay: step.id === startStepId && !execution.isRunning ? () => runWorkflow() : undefined,
            onUpdateStep: (updatedStep: FlowStep) => updateStep(updatedStep),
            onStepComplete: handleStepComplete
          }
        };
      });

      return newNodes;
    });

    const newEdges: Edge[] = [];
    
    steps.forEach(step => {
      step.next_steps.forEach(nextStepId => {
        const isRunning = execution.runningSteps.has(step.id);
        const edgeId = `${step.id}-${nextStepId}`;
        const edgeMetadataInfo = edgeMetadata[edgeId];
        const isFeedbackLoop = edgeMetadataInfo?.is_feedback_loop || false;
        const feedbackState = feedbackLoopState[edgeId];
        const isFeedbackLoopActive = feedbackState?.isActive || false;
        
        newEdges.push({
          id: edgeId,
          source: step.id,
          target: nextStepId,
          type: 'customDefault',
          animated: isRunning || isFeedbackLoop || isFeedbackLoopActive,
          data: {
            isFeedbackLoop,
            isRunning,
            isCompleted: execution.completedSteps.has(step.id),
            isFailed: false, // TODO: Add failed step tracking
            isDragging,
            maxIterations: edgeMetadataInfo?.max_iterations,
            qualityThreshold: edgeMetadataInfo?.quality_threshold,
            feedbackLoopState: feedbackState,
            onConfigureFeedbackLoop: handleConfigureFeedbackLoop,
            onConvertToFeedbackLoop: handleConvertToFeedbackLoop,
            onRemoveFeedbackLoop: handleRemoveFeedbackLoop,
          },
        });
      });
    });

    setEdges(newEdges);
  }, [steps, startStepId, execution, newlyCreatedSteps, agents, llms, mcpConnections, mcpToolCounts, isDragging, edgeMetadata, feedbackLoopState]);

  // Debounced effect to update stepOutputs without interfering with main useEffect
  useEffect(() => {
    if (Object.keys(stepOutputs).length === 0) return; // Skip empty stepOutputs
    
    // Use a small delay to avoid race conditions with main useEffect
    const timeoutId = setTimeout(() => {
      setNodes((currentNodes) => {
        return currentNodes.map(node => {
          const currentStepOutputs = node.data.stepOutputs || {};
          const newStepOutputs = stepOutputs;
          
          // Only update if stepOutputs actually changed for this node  
          if (JSON.stringify(currentStepOutputs) === JSON.stringify(newStepOutputs)) {
            return node;
          }
          
          return {
            ...node,
            data: {
              ...node.data,
              stepOutputs: newStepOutputs
            }
          };
        });
      });
    }, 50); // Small delay to let main useEffect complete first
    
    return () => clearTimeout(timeoutId);
  }, [stepOutputs]);

  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;

    // Prevent self-connections
    if (params.source === params.target) return;

    // Add edge to React Flow's edge state
    setEdges((eds) => addEdge(params, eds));

    // Update the source step to include the target in next_steps for business logic
    const updatedSteps = steps.map(step => {
      if (step.id === params.source) {
        // Prevent duplicate connections
        if (step.next_steps.includes(params.target!)) return step;

        return {
          ...step,
          next_steps: [...step.next_steps, params.target!]
        };
      }
      return step;
    });

    // Create edge metadata entry
    const edgeId = `${params.source}-${params.target}`;
    const updatedEdgeMetadata = {
      ...edgeMetadata,
      [edgeId]: {
        edge_id: edgeId,
        source_step_id: params.source,
        target_step_id: params.target,
        is_feedback_loop: false,
      },
    };

    console.log('🔗 onConnect - Creating edge metadata:', edgeId, updatedEdgeMetadata);

    onStepsChange(updatedSteps);
    onEdgeMetadataChange(updatedEdgeMetadata);
  }, [steps, onStepsChange, setEdges, edgeMetadata, onEdgeMetadataChange]);

  const onEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    const updatedSteps = steps.map(step => {
      const updatedNextSteps = step.next_steps.filter(nextStepId => {
        // Check if this connection should be removed
        return !edgesToDelete.some(edge => 
          edge.source === step.id && edge.target === nextStepId
        );
      });
      
      return {
        ...step,
        next_steps: updatedNextSteps
      };
    });

    // Clean up edge metadata for deleted edges
    const updatedEdgeMetadata = { ...edgeMetadata };
    edgesToDelete.forEach(edge => {
      const edgeId = edge.id;
      if (updatedEdgeMetadata[edgeId]) {
        delete updatedEdgeMetadata[edgeId];
      }
    });

    onStepsChange(updatedSteps);
    onEdgeMetadataChange(updatedEdgeMetadata);
  }, [steps, onStepsChange, edgeMetadata, onEdgeMetadataChange]);

  const addNewStep = (position: { x: number; y: number } = { x: 200, y: 200 }) => {
    // Find the first available agent with an LLM
    const availableAgent = agents.find(agent => agent.llm_id);
    
    const newStep: FlowStep = {
      id: `step-${Date.now()}`,
      agent_id: availableAgent?.id,
      name: 'New Step',
      description: 'A new step in the flow',
      system_prompt: availableAgent?.description || 'You are a helpful assistant. Process the given input and provide detailed analysis.',
      type: 'llm',
      parameters: {},
      next_steps: [],
      retry_count: 1,
      position
    };

    // Add the new step directly to the flow
    onStepsChange([...steps, newStep]);
    
    // Mark the new step as new for immediate editing
    setNewlyCreatedSteps(prev => new Set([...prev, newStep.id]));
  };

  const deleteStep = (stepId: string) => {
    if (steps.length <= 1) {
      toast({
        title: "Cannot Delete",
        description: "You must have at least one step in the flow",
        variant: "destructive"
      });
      return;
    }

    // Open confirmation dialog
    setStepToDelete(stepId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteStep = () => {
    if (!stepToDelete) return;

    const updatedSteps = steps
      .filter(step => step.id !== stepToDelete)
      .map(step => ({
        ...step,
        next_steps: step.next_steps.filter(id => id !== stepToDelete)
      }));

    onStepsChange(updatedSteps);

    // If deleted step was the start step, reset start step
    if (stepToDelete === startStepId) {
      onStartStepChange('');
    }

    // Close dialog and clear state
    setDeleteDialogOpen(false);
    setStepToDelete(null);

    toast({
      title: "Step Deleted",
      description: "The step has been removed from the flow",
    });
  };

  const updateStep = (updatedStep: FlowStep) => {
    const updatedSteps = steps.map(step => 
      step.id === updatedStep.id ? updatedStep : step
    );
    onStepsChange(updatedSteps);
    
    // Remove from newly created steps set once edited
    setNewlyCreatedSteps(prev => {
      const newSet = new Set(prev);
      newSet.delete(updatedStep.id);
      return newSet;
    });
  };

  const saveNode = (nodeData: FlowStep) => {
    const existingStepIndex = steps.findIndex(step => step.id === nodeData.id);

    if (existingStepIndex >= 0) {
      // Update existing step
      const updatedSteps = [...steps];
      updatedSteps[existingStepIndex] = nodeData;
      onStepsChange(updatedSteps);
    } else {
      // Add new step
      onStepsChange([...steps, nodeData]);
    }

    // Keep the panel open while editing
    // Panel will close when clicking outside or clicking the X button
  };

  const handleStepComplete = useCallback((stepId: string) => {
    const callback = execution.stepCompletionCallbacks.get(stepId);
    if (callback) {
      callback();
      setExecution(prev => {
        const newCallbacks = new Map(prev.stepCompletionCallbacks);
        newCallbacks.delete(stepId);
        return {
          ...prev,
          stepCompletionCallbacks: newCallbacks
        };
      });
    }
  }, [execution.stepCompletionCallbacks]);

  // Define handleExecutionEvent first with proper memoization
  const handleExecutionEvent = useCallback((event: any) => {
    // Skip special events that don't need deduplication
    const skipDeduplication = ['connection_established', 'heartbeat'].includes(event.event_type);

    // Check for duplicate events by ID (except for special events)
    if (!skipDeduplication && event.id) {
      if (processedEventIdsRef.current.has(event.id)) {
        console.log(`⏭️ Skipping duplicate event ${event.event_type} (ID: ${event.id})`);
        return;
      }

      // Mark event as processed (using ref, no re-render)
      processedEventIdsRef.current.add(event.id);
    }

    switch (event.event_type) {
      case 'connection_established':
        // Connection established - ready to receive events
        // Check if this is a reconnection to an already completed execution
        if (event.data?.is_completed === true) {
          console.log('⚠️ Connected to already completed execution - stopping flow immediately');

          // Mark execution as finished to prevent future reconnection
          if (currentExecutionId) {
            finishedExecutionsRef.current.add(currentExecutionId);
            console.log(`📝 Marked execution ${currentExecutionId} as finished`);
          }

          // IMPORTANT: Stop automatic reconnection attempts FIRST
          if (eventSource) {
            console.log('🛑 Stopping automatic reconnection attempts BEFORE state updates');
            eventSource.stopReconnecting?.();
          }

          // Then stop the execution UI
          setExecution(prev => ({
            ...prev,
            isRunning: false,
            currentStepId: null,
            runningSteps: new Set()
          }));

          // Show toast only once per execution
          const toastKey = `execution_already_completed_${currentExecutionId}`;
          if (currentExecutionId && !shownToasts.has(toastKey)) {
            setShownToasts(prev => new Set([...prev, toastKey]));
            toast({
              title: "Execution Already Completed",
              description: "This execution has already finished.",
            });
          }

          // Finally close the connection
          if (eventSource) {
            console.log('🔌 Closing SSE connection to completed execution');
            eventSource.close();
            setEventSource(null);
            setConnectionState('disconnected');
          }
        }
        break;
        
      case 'heartbeat':
        // Heartbeat events confirm connection stability - update connection state
        if (connectionState !== 'connected') {
          console.log('📡 Connection restored via heartbeat');
          setConnectionState('connected');
        }
        break;
        
      case 'execution_started':
        // Smart flow state detection instead of always showing "Execution Started"
        const toastKey = `execution_started_${currentExecutionId}`;
        
        // Only show toast for genuinely new executions
        const isNewExecution = !execution.isRunning && execution.completedSteps.size === 0 && !shownToasts.has(toastKey);
        
        if (isNewExecution) {
          setShownToasts(prev => new Set([...prev, toastKey]));
          toast({
            title: "Flow Execution Started",
            description: `Starting execution of "${flowName || 'Flow'}"`,
          });
        } else {
          // For reconnections, show a subtle connection status instead
          console.log('🔄 Reconnected to ongoing execution');
        }
        break;
        
      case 'step_started':
        setExecution(prev => ({
          ...prev,
          currentStepId: event.step_id,
          runningSteps: new Set([...prev.runningSteps, event.step_id])
        }));
        
        // Handle feedback loop role-specific messages
        if (event.data?.feedback_role) {
          const stepName = steps.find(s => s.id === event.step_id)?.name || event.step_id;
          const roleAction = event.data.feedback_role === 'assessor' ? 'providing feedback' : 'improving work';
          console.log(`🔄 Feedback Loop: ${stepName} is ${roleAction} (iteration ${event.data.iteration})`);
        }
        break;
        
      case 'step_completed':
        // Handle feedback loop outputs differently
        if (event.data?.feedback_role) {
          const stepName = steps.find(s => s.id === event.step_id)?.name || event.step_id;
          const role = event.data.feedback_role;
          const iteration = event.data.iteration;
          
          
          // For feedback loops, store outputs in a special feedback section
          const feedbackOutput = event.data?.agent_output || event.data?.result?.output;
          if (feedbackOutput) {
            setStepOutputs(prev => {
              const currentStepData = prev[event.step_id] || {};
              const existingIterations = currentStepData.feedback_iterations || [];

              // Check if this exact iteration already exists to prevent duplicates
              const alreadyExists = existingIterations.some(iter =>
                iter.iteration === iteration && iter.role === role
              );

              if (alreadyExists) {
                return prev;
              }


              return {
                ...prev,
                [event.step_id]: {
                  ...currentStepData,
                  feedback_iterations: [
                    ...existingIterations,
                    {
                      iteration: iteration,
                      role: role,
                      output: feedbackOutput,
                      timestamp: new Date().toISOString(),
                      stepName: stepName
                    }
                  ]
                }
              };
            });
          }
          
          console.log(`🔄 Feedback Loop Complete: ${stepName} finished ${role === 'assessor' ? 'assessment' : 'improvement'} (iteration ${iteration})`);
        } else {
          // Regular step completion
          // Support both event.data.agent_output (Python backend) and event.data.result.output (Rust backend)
          const agentOutput = event.data?.agent_output || event.data?.result?.output;
          if (agentOutput) {
            setStepOutputs(prev => ({
              ...prev,
              [event.step_id]: {
                ...prev[event.step_id],
                final_output: agentOutput
              }
            }));
          }
        }
        
        setExecution(prev => {
          const newRunningSteps = new Set(prev.runningSteps);
          newRunningSteps.delete(event.step_id);
          const newCompletedSteps = new Set([...prev.completedSteps, event.step_id]);

          return {
            ...prev,
            runningSteps: newRunningSteps,
            completedSteps: newCompletedSteps
          };
        });

        // Update agent response status to completed
        setAgentResponses(prev => prev.map(response =>
          response.stepId === event.step_id && response.status === 'running'
            ? { ...response, status: 'completed' as const }
            : response
        ));
        break;
        
      case 'step_failed':
        setExecution(prev => {
          const newRunningSteps = new Set(prev.runningSteps);
          newRunningSteps.delete(event.step_id);

          return {
            ...prev,
            runningSteps: newRunningSteps,
            isRunning: false
          };
        });

        // Update agent response status to failed
        setAgentResponses(prev => prev.map(response =>
          response.stepId === event.step_id && response.status === 'running'
            ? { ...response, status: 'failed' as const }
            : response
        ));

        toast({
          title: "Step Failed",
          description: event.message,
          variant: "destructive"
        });
        break;

      case 'approval_required':
        // Show approval modal with content from the event
        const stepName = steps.find(s => s.id === event.step_id)?.name || 'Step';
        setApprovalData({
          stepId: event.step_id || '',
          stepName: event.data?.step_name || stepName,
          approvalMessage: event.data?.approval_message || event.message,
          content: event.data?.content || 'No content provided',
        });
        setApprovalModalOpen(true);

        toast({
          title: "Approval Required",
          description: `Please review and approve "${stepName}"`,
        });
        break;

      case 'approval_granted':
        toast({
          title: "Approval Granted",
          description: event.message,
        });
        break;

      case 'approval_rejected':
        toast({
          title: "Approval Rejected",
          description: event.message,
        });
        break;

      case 'execution_completed':
        console.log('🎉 EXECUTION_COMPLETED event received!', {
          currentIsRunning: execution.isRunning,
          eventData: event.data
        });

        // Mark execution as finished to prevent future reconnection
        if (currentExecutionId) {
          finishedExecutionsRef.current.add(currentExecutionId);
          console.log(`📝 Marked execution ${currentExecutionId} as finished (completed)`);
        }

        // IMPORTANT: Stop automatic reconnection attempts FIRST before any state updates
        if (eventSource) {
          console.log('🛑 Stopping automatic reconnection attempts BEFORE state updates');
          eventSource.stopReconnecting?.();
        }

        // Update execution state and clear execution ID
        // Preserve completedSteps to maintain node visual states after execution
        console.log('✅ Processing execution_completed - stopping execution, setting isRunning=false');
        setExecution(prev => ({
          ...prev,
          isRunning: false,
          currentStepId: null,
          runningSteps: new Set()
          // Keep completedSteps intact so nodes remain visible with completed state
        }));
        setCurrentExecutionId(null);

        // Only show toast if this is the first completion event
        if (execution.isRunning) {
          toast({
            title: "Execution Completed",
            description: event.message,
          });
        }

        // Now close the connection after stopping reconnection
        if (eventSource) {
          console.log('🔌 Closing SSE connection after execution completion');
          eventSource.close();
          setEventSource(null);
          setConnectionState('disconnected');
        }
        break;
        
      case 'execution_failed':
        // Mark execution as finished to prevent future reconnection
        if (currentExecutionId) {
          finishedExecutionsRef.current.add(currentExecutionId);
          console.log(`📝 Marked execution ${currentExecutionId} as finished (failed)`);
        }

        // IMPORTANT: Stop automatic reconnection attempts FIRST
        if (eventSource) {
          console.log('🛑 Stopping automatic reconnection attempts (execution failed)');
          eventSource.stopReconnecting?.();
        }

        // Update execution state and clear execution ID
        setExecution(prev => ({
          ...prev,
          isRunning: false,
          currentStepId: null,
          runningSteps: new Set()
        }));
        setCurrentExecutionId(null);

        toast({
          title: "Execution Failed",
          description: event.message,
          variant: "destructive"
        });

        // Close SSE connection
        if (eventSource) {
          eventSource.close();
          setEventSource(null);
          setConnectionState('disconnected');
        }
        break;

      case 'execution_cancelled':
        // Mark execution as finished to prevent future reconnection
        if (currentExecutionId) {
          finishedExecutionsRef.current.add(currentExecutionId);
          console.log(`📝 Marked execution ${currentExecutionId} as finished (cancelled)`);
        }

        // IMPORTANT: Stop automatic reconnection attempts FIRST
        if (eventSource) {
          console.log('🛑 Stopping automatic reconnection attempts (execution cancelled)');
          eventSource.stopReconnecting?.();
        }

        // Update execution state and clear execution ID
        setExecution(prev => ({
          ...prev,
          isRunning: false,
          currentStepId: null,
          runningSteps: new Set()
        }));
        setCurrentExecutionId(null);

        toast({
          title: "Execution Cancelled",
          description: event.message,
        });

        // Close SSE connection
        if (eventSource) {
          eventSource.close();
          setEventSource(null);
          setConnectionState('disconnected');
        }
        break;
        
      case 'llm_streaming_chunk':
        // Handle streaming chunks in real-time
        if (event.data && event.data.chunk) {
          const chunk = event.data.chunk;
          const round = event.data.round || 0;
          const stepId = event.step_id;

          // Accumulate chunks in stepOutputs
          setStepOutputs(prev => {
            const existingData = prev[stepId] || {};
            const streamingContent = existingData.streaming_content || {};
            const currentContent = streamingContent[round] || '';

            return {
              ...prev,
              [stepId]: {
                ...existingData,
                streaming_content: {
                  ...streamingContent,
                  [round]: currentContent + chunk
                },
                streaming_active: true
              }
            };
          });

          // Also update agent responses panel with streaming content
          const step = steps.find(s => s.id === stepId);
          if (step) {
            const agent = agents.find(a => a.id === step.agent_id);

            setAgentResponses(prev => {
              // Find existing streaming response for this step/round
              const existingIndex = prev.findIndex(r =>
                r.stepId === stepId &&
                r.status === 'streaming' &&
                r.round === round
              );

              if (existingIndex >= 0) {
                // Update existing streaming response
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  output: updated[existingIndex].output + chunk
                };
                return updated;
              } else {
                // Create new streaming response
                return [...prev, {
                  stepId: stepId,
                  stepName: step.name || `Step ${stepId}`,
                  agentName: event.data.agent_name || agent?.name || 'Unknown Agent',
                  agentAvatar: agent?.avatar_url,
                  agentColor: agent?.color,
                  output: chunk,
                  timestamp: new Date(),
                  status: 'streaming' as const,
                  round: round
                }];
              }
            });
          }
        }
        break;

      case 'llm_response':
        // Store LLM response for streaming display with deduplication
        if (event.data) {
          console.log(`📝 LLM Response for step ${event.step_id}: content="${event.data.content}" (${event.data.content?.length || 0} chars)`);
          console.time(`LLM_UI_Update_${event.step_id}_${event.data.round}`);
        }
        if (event.data) {
          flushSync(() => {
            setStepOutputs(prev => {
            const existingResponses = prev[event.step_id]?.llm_responses || [];
            const round = event.data.round || 0;
            const content = event.data.content || '';

            // Check if this exact response already exists (same content and round)
            const isDuplicate = existingResponses.some(response =>
              response.content === content && response.round === round
            );

            if (isDuplicate) {
              console.log(`🔄 Skipping duplicate LLM response for step ${event.step_id}, round ${round}`);
              return prev;
            }

            // Handle empty content case
            const displayContent = content || '[Empty LLM response - this may indicate an issue with the LLM model or prompt]';

            const newState = {
              ...prev,
              [event.step_id]: {
                ...prev[event.step_id],
                llm_responses: [
                  ...existingResponses,
                  {
                    content: displayContent,
                    round: round,
                    tool_calls: event.data.tool_calls,
                    model_used: event.data.model_used,
                    timestamp: new Date().toISOString(),
                    isEmpty: !content
                  }
                ],
                // Clear streaming state when final response arrives
                streaming_active: false
              }
            };

            // Log when state update completes
            setTimeout(() => {
              console.timeEnd(`LLM_UI_Update_${event.step_id}_${round}`);
              console.log(`✅ UI State updated for step ${event.step_id} round ${round}`);
            }, 0);

            return newState;
            });
          });

          // Add response to agent responses panel (with deduplication)
          const step = steps.find(s => s.id === event.step_id);
          if (step && event.data.content) {
            // Find the agent to get avatar and color
            const agent = agents.find(a => a.id === step.agent_id);

            setAgentResponses(prev => {
              const round = event.data.round || 0;

              // Check if there's a streaming response for this step/round
              const streamingIndex = prev.findIndex(r =>
                r.stepId === event.step_id &&
                r.status === 'streaming' &&
                r.round === round
              );

              if (streamingIndex >= 0) {
                // Convert streaming response to running with final content
                const updated = [...prev];
                updated[streamingIndex] = {
                  ...updated[streamingIndex],
                  output: event.data.content,
                  status: 'running'
                };
                return updated;
              }

              // Check if this exact response already exists
              const existingResponse = prev.find(r =>
                r.stepId === event.step_id &&
                r.output === event.data.content
              );

              if (existingResponse) {
                console.log(`⏭️ Skipping duplicate response for step ${event.step_id}`);
                return prev;
              }

              // Add new response with agent avatar and color (fallback if no streaming)
              return [...prev, {
                stepId: event.step_id,
                stepName: step.name || `Step ${event.step_id}`,
                agentName: event.data.agent_name || agent?.name || 'Unknown Agent',
                agentAvatar: agent?.avatar_url,
                agentColor: agent?.color,
                output: event.data.content,
                timestamp: new Date(),
                status: 'running',
                round: round
              }];
            });
          }
        }
        break;
        
      case 'tool_call_started':
        // Track tool execution start with deduplication
        console.log(`🔧 Tool started: ${event.data?.tool_name} (Round ${event.data?.round})`);
        flushSync(() => {
          setStepOutputs(prev => {
          const existingToolCalls = prev[event.step_id]?.tool_calls || [];
          const toolName = event.data?.tool_name;
          const round = event.data?.round;
          const callIndex = event.data?.call_index;
          
          // Check if this exact tool call already exists (same tool, round, and call index)
          const isDuplicate = existingToolCalls.some(tc => 
            tc.tool_name === toolName && tc.round === round && tc.call_index === callIndex
          );
          
          if (isDuplicate) {
            console.log(`🔄 Skipping duplicate tool call start for ${toolName}, round ${round}, call ${callIndex}`);
            return prev;
          }
          
          return {
            ...prev,
            [event.step_id]: {
              ...prev[event.step_id],
              tool_calls: [
                ...existingToolCalls,
                {
                  tool_name: toolName,
                  status: 'started',
                  round: round,
                  call_index: callIndex,
                  timestamp: new Date().toISOString()
                }
              ]
            }
          };
          });
        });
        break;
        
      case 'tool_call_completed':
        // Update tool execution completion
        console.log(`✅ Tool completed: ${event.data?.tool_name} (${event.data?.success ? 'success' : 'failed'})`);
        flushSync(() => {
          setStepOutputs(prev => {
          const stepOutput = prev[event.step_id] || {};
          const toolCalls = stepOutput.tool_calls || [];
          const updatedToolCalls = toolCalls.map(tc => 
            tc.tool_name === event.data?.tool_name && tc.round === event.data?.round
              ? { ...tc, status: event.data?.success ? 'completed' : 'failed', result: event.data?.result }
              : tc
          );
          return {
            ...prev,
            [event.step_id]: {
              ...stepOutput,
              tool_calls: updatedToolCalls
            }
          };
          });
        });
        break;
        
      case 'bidirectional_feedback_started':
        // Initialize feedback loop UI state
        if (event.data) {
          const edgeId = event.data.edge_id;
          const sourceStepId = event.data.source_step_id;
          const targetStepId = event.data.target_step_id;
          const maxIterations = event.data.max_iterations || 25;
          
          setFeedbackLoopState(prev => ({
            ...prev,
            [edgeId]: {
              isActive: true,
              currentIteration: 0,
              maxIterations: maxIterations,
              sourceStepId: sourceStepId,
              targetStepId: targetStepId
            }
          }));
          
          toast({
            title: "Bidirectional Feedback Started",
            description: `Starting collaboration between ${steps.find(s => s.id === sourceStepId)?.name} and ${steps.find(s => s.id === targetStepId)?.name}`,
          });
        }
        break;
        
      case 'feedback_loop_iteration':
        // Update iteration progress for feedback loops
        if (event.data) {
          const edgeId = event.data.edge_id;
          const iteration = event.data.iteration;
          
          if (edgeId) {
            setFeedbackLoopState(prev => ({
              ...prev,
              [edgeId]: prev[edgeId] ? {
                ...prev[edgeId],
                currentIteration: iteration
              } : prev[edgeId]
            }));
          }
          
          console.log(`🔄 Feedback loop iteration ${iteration}/${event.data.max_iterations} for edge ${edgeId}`);
        }
        break;
        
      case 'bidirectional_feedback_completed':
        // Mark feedback loop as complete
        if (event.data) {
          const edgeId = event.data.edge_id;
          const converged = event.data.converged;
          const iterations = event.data.iterations;
          const finalScore = event.data.final_score;
          
          setFeedbackLoopState(prev => ({
            ...prev,
            [edgeId]: prev[edgeId] ? {
              ...prev[edgeId],
              isActive: false,
              currentIteration: iterations
            } : prev[edgeId]
          }));
          
          toast({
            title: `Bidirectional Feedback ${converged ? 'Converged' : 'Completed'}`,
            description: `Finished after ${iterations} iteration${iterations !== 1 ? 's' : ''}${finalScore ? ` with score ${finalScore.toFixed(2)}` : ''}`,
          });
        }
        break;
        
      default:
        console.log('Unhandled event type:', event.event_type);
    }
  }, [toast, setExecution, setStepOutputs, eventSource, setEventSource, setConnectionState, shownToasts, currentExecutionId, flowName, steps, setFeedbackLoopState, execution.isRunning]);

  // Centralized SSE connection management with improved stability
  const connectToExecution = useCallback((executionId: string, isNewExecution: boolean = false) => {
    // Check if this execution has already finished - prevent reconnection
    if (finishedExecutionsRef.current.has(executionId)) {
      console.log(`⏭️ Execution ${executionId} has already finished - skipping connection`);
      return;
    }

    // Prevent duplicate connections
    if (connectionState === 'connecting' || (connectionState === 'connected' && currentExecutionId === executionId)) {
      console.log(`🔄 SSE connection already exists for execution ${executionId}, skipping...`);
      return;
    }

    // Close existing connection if connecting to different execution
    if (eventSource && currentExecutionId !== executionId) {
      console.log(`🔄 Closing existing SSE connection for ${currentExecutionId}`);
      eventSource.close();
      setEventSource(null);
      // Clear processed events when switching to different execution
      processedEventIdsRef.current.clear();
    }

    console.log(`🔗 Connecting to SSE for execution ${executionId} (new: ${isNewExecution})`);
    setConnectionState('connecting');
    setCurrentExecutionId(executionId);

    // Clear processed events for new executions
    if (isNewExecution) {
      processedEventIdsRef.current.clear();
    }

    try {
      const newEventSource = executionsApi.subscribeToExecutionEvents(
        executionId,
        (event) => {
          // Add connection stability logging
          if (event.event_type === 'connection_established') {
            console.log(`✅ SSE connection confirmed for execution ${executionId}`);
            setConnectionState('connected');
          }
          handleExecutionEvent(event);
        },
        (error) => {
          console.error('⚠️ SSE connection error:', error);
          setConnectionState('disconnected');
          
          // Only show error toast for new executions or critical errors
          if (isNewExecution) {
            toast({
              title: "Connection Issue",
              description: "Attempting to reconnect to execution stream...",
              variant: "destructive"
            });
          }
        }
      );
      
      setEventSource(newEventSource);
      
      // Set connected state immediately, but confirm with heartbeat
      setConnectionState('connected');
      console.log(`✅ SSE connection established for execution ${executionId}`);
      
    } catch (error) {
      console.error('❌ Failed to create SSE connection:', error);
      setConnectionState('disconnected');
      
      if (isNewExecution) {
        toast({
          title: "Connection Error",
          description: "Failed to connect to execution stream. Please try again.",
          variant: "destructive"
        });
      }
    }
  }, [connectionState, currentExecutionId, eventSource, toast, handleExecutionEvent]);

  // Store the latest connectToExecution function in ref
  React.useEffect(() => {
    connectToExecutionRef.current = connectToExecution;
  }, [connectToExecution]);

  const runWorkflow = async () => {
    if (!startStepId || execution.isRunning || !flowId) {
      
      if (!flowId) {
        toast({
          title: "Cannot Execute",
          description: "Flow must be saved before execution",
          variant: "destructive"
        });
      }
      if (!startStepId) {
        toast({
          title: "Cannot Execute", 
          description: "No start step selected",
          variant: "destructive"
        });
      }
      if (execution.isRunning) {
        toast({
          title: "Cannot Execute",
          description: "Flow is already running",
          variant: "destructive"
        });
      }
      return;
    }
    
    try {
      // Clear previous execution state and outputs
      setStepOutputs({});
      setShownToasts(new Set()); // Clear toast history for new execution
      setAgentResponses([]); // Clear agent responses
      processedEventIdsRef.current.clear(); // Clear processed event IDs for new execution
      setExecution({
        isRunning: false,
        currentStepId: null,
        completedSteps: new Set(),
        runningSteps: new Set(),
        stepCompletionCallbacks: new Map()
      });

      // Clear any existing connections
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
        setConnectionState('disconnected');
      }
      
      // Start real flow execution
      const executionResult = await flowsApi.executeFlow(flowId, {
        input_data: {},
        variables: variables
      });
      
      // Set initial execution state
      setExecution({
        isRunning: true,
        currentStepId: startStepId,
        completedSteps: new Set(),
        runningSteps: new Set([startStepId]),
        stepCompletionCallbacks: new Map()
      });
      
      // Connect to SSE events for real-time updates
      connectToExecution(executionResult.id, true);
      
      toast({
        title: "Flow Execution Started",
        description: `Executing "${flowName || 'Flow'}" with real agents`,
      });
      
    } catch (error) {
      console.error('❌ Flow execution failed:', error);
      toast({
        title: "Execution Failed",
        description: "Failed to start flow execution",
        variant: "destructive"
      });
      setExecution(prev => ({ ...prev, isRunning: false }));
    }
  };

  const stopWorkflow = async () => {
    if (!currentExecutionId || !execution.isRunning) {
      toast({
        title: "Cannot Stop",
        description: "No running execution to stop",
        variant: "destructive"
      });
      return;
    }

    try {
      await flowsApi.cancelExecution(currentExecutionId);
      
      // Update local state immediately
      setExecution(prev => ({
        ...prev,
        isRunning: false,
        currentStepId: null,
        runningSteps: new Set()
      }));

      // Close SSE connection
      if (eventSource) {
        eventSource.close();
        setEventSource(null);
        setConnectionState('disconnected');
      }

      toast({
        title: "Execution Stopped",
        description: "Flow execution has been cancelled",
      });

    } catch (error) {
      console.error('❌ Failed to stop flow execution:', error);
      toast({
        title: "Stop Failed",
        description: "Failed to stop flow execution",
        variant: "destructive"
      });
    }
  };

  
  // Check for existing executions when flow loads (only on mount or flowId change)
  useEffect(() => {
    const checkExistingExecution = async () => {
      if (!flowId) return;

      // Skip if we're already connected to an execution
      if (connectionState === 'connected' && currentExecutionId) {
        console.log('⏭️ Skipping execution check - already connected to', currentExecutionId);
        return;
      }

      // Skip if we already have a running execution locally
      if (execution.isRunning && currentExecutionId) {
        console.log('⏭️ Skipping execution check - execution already running locally');
        return;
      }

      try {
        // Get recent executions for this flow
        const executions = await executionsApi.getExecutions(flowId, 0, 5);

        // Find any TRULY running execution (only "running" status, not "pending")
        // "pending" status means it hasn't started yet, so we shouldn't show it as running
        const runningExecution = executions.executions.find(
          exec => exec.status === 'running'
        );

        if (runningExecution) {
          console.log('🔄 Found existing running execution:', runningExecution.id);

          // Skip if this is the same execution we're already tracking
          if (currentExecutionId === runningExecution.id) {
            console.log('⏭️ Already tracking this execution, skipping');
            return;
          }

          // Double check that the execution isn't stale (older than 5 minutes without updates)
          const lastUpdate = new Date(runningExecution.updated_at || runningExecution.created_at);
          const now = new Date();
          const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 1000 / 60;

          if (minutesSinceUpdate > 5) {
            console.warn(`⚠️ Execution ${runningExecution.id} appears stale (${minutesSinceUpdate.toFixed(1)} minutes since update), skipping reconnection`);
            return;
          }

          // Set execution state
          setExecution({
            isRunning: true,
            currentStepId: runningExecution.current_step_id || startStepId,
            completedSteps: new Set(runningExecution.completed_steps || []),
            runningSteps: new Set(runningExecution.current_step_id ? [runningExecution.current_step_id] : []),
            stepCompletionCallbacks: new Map()
          });

          // Connect to SSE for ongoing execution
          connectToExecutionRef.current?.(runningExecution.id, false);

          toast({
            title: "Reconnected to Execution",
            description: `Monitoring ongoing execution of "${flowName || 'Flow'}"`,
          });
        }
      } catch (error) {
        console.error('Error checking existing executions:', error);
      }
    };

    // Only check once on mount or when flowId changes
    checkExistingExecution();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // Clean up SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [eventSource]);

  const simulateWorkflowExecution = async (currentStepId: string, visitedSteps = new Set<string>()) => {
    if (visitedSteps.has(currentStepId)) return; // Prevent infinite loops
    visitedSteps.add(currentStepId);
    
    const currentStep = steps.find(step => step.id === currentStepId);
    if (!currentStep) return;
    
    // Mark step as running
    setExecution(prev => ({
      ...prev,
      currentStepId,
      runningSteps: new Set([...prev.runningSteps, currentStepId])
    }));
    
    // Wait for typewriter animation to complete
    await new Promise<void>(resolve => {
      setExecution(prev => {
        const newCallbacks = new Map(prev.stepCompletionCallbacks);
        newCallbacks.set(currentStepId, resolve);
        return {
          ...prev,
          stepCompletionCallbacks: newCallbacks
        };
      });
    });
    
    // Mark step as completed
    setExecution(prev => {
      const newRunningSteps = new Set(prev.runningSteps);
      newRunningSteps.delete(currentStepId);
      const newCompletedSteps = new Set([...prev.completedSteps, currentStepId]);
      
      return {
        ...prev,
        runningSteps: newRunningSteps,
        completedSteps: newCompletedSteps
      };
    });
    
    // Execute next steps
    const nextSteps = currentStep.next_steps;
    if (nextSteps.length > 0) {
      // Execute next steps in parallel
      const nextExecutions = nextSteps.map(nextStepId => 
        simulateWorkflowExecution(nextStepId, new Set(visitedSteps))
      );
      await Promise.all(nextExecutions);
    } else {
      // No more steps, workflow complete
      setExecution(prev => ({
        ...prev,
        isRunning: false,
        currentStepId: null
      }));
      
      // Show success toast
      toast({
        title: "Workflow Completed! 🎉",
        description: "All steps have been executed successfully.",
      });
    }
  };

  const duplicateStep = useCallback((stepId: string) => {
    const stepToDuplicate = steps.find(step => step.id === stepId);
    if (!stepToDuplicate) return;

    const newStep: FlowStep = {
      ...stepToDuplicate,
      id: `step-${Date.now()}`,
      name: `${stepToDuplicate.name} (copy)`,
      next_steps: [],
      position: {
        x: (stepToDuplicate.position?.x || 0) + 50,
        y: (stepToDuplicate.position?.y || 0) + 50,
      },
    };

    onStepsChange([...steps, newStep]);
    setSelectedNode(newStep);
    setShowPropertiesPanel(true);
    setNewlyCreatedSteps(prev => new Set([...prev, newStep.id]));

    toast({
      title: "Step Duplicated",
      description: `"${stepToDuplicate.name}" has been duplicated`,
    });
  }, [steps, onStepsChange, toast]);

  const onNodeDragStart = useCallback((_event: React.MouseEvent, node: Node) => {
    setIsDragging(true);
    setDraggedNodeId(node.id);
  }, []);

  const onNodeDrag = useCallback((_event: React.MouseEvent, node: Node) => {
    if (!trashZoneRef.current) return;

    const trashRect = trashZoneRef.current.getBoundingClientRect();
    const nodeElement = document.querySelector(`[data-id="${node.id}"]`);

    if (nodeElement) {
      const nodeRect = nodeElement.getBoundingClientRect();
      const nodeCenterX = nodeRect.left + nodeRect.width / 2;
      const nodeCenterY = nodeRect.top + nodeRect.height / 2;

      const isOver =
        nodeCenterX >= trashRect.left - 50 &&
        nodeCenterX <= trashRect.right + 50 &&
        nodeCenterY >= trashRect.top - 50 &&
        nodeCenterY <= trashRect.bottom + 50;

      setIsOverTrash(isOver);
    }
  }, []);

  const onNodeDragStop = useCallback((_event: unknown, node: Node) => {
    if (isOverTrash && trashZoneRef.current) {
      if (steps.length <= 1) {
        toast({
          title: "Cannot Delete",
          description: "You must have at least one step in the flow",
          variant: "destructive"
        });
      } else {
        setStepToDelete(node.id);
        setDeleteDialogOpen(true);
      }
    } else {
      const updatedSteps = steps.map(step => {
        if (step.id === node.id) {
          return {
            ...step,
            position: node.position
          };
        }
        return step;
      });
      onStepsChange(updatedSteps);
    }

    setIsDragging(false);
    setDraggedNodeId(null);
    setIsOverTrash(false);
  }, [steps, onStepsChange, isOverTrash, toast]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault();
    
    if (flowRef.current) {
      const pane = flowRef.current.getBoundingClientRect();
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      
      const flowPosition = {
        x: clientX - pane.left,
        y: clientY - pane.top
      };
      
      // Ensure context menu doesn't go off screen
      const menuWidth = 120;
      const menuHeight = 40;
      const x = clientX + menuWidth > window.innerWidth 
        ? clientX - menuWidth 
        : clientX;
      const y = clientY + menuHeight > window.innerHeight 
        ? clientY - menuHeight 
        : clientY;
      
      setContextMenu({
        x,
        y,
        flowX: flowPosition.x,
        flowY: flowPosition.y
      });
    }
  }, []);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 160;
    const menuHeight = 100;
    const x = event.clientX + menuWidth > window.innerWidth
      ? event.clientX - menuWidth
      : event.clientX;
    const y = event.clientY + menuHeight > window.innerHeight
      ? event.clientY - menuHeight
      : event.clientY;

    setNodeContextMenu({ x, y, nodeId: node.id });
    setContextMenu(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setNodeContextMenu(null);
    // Close the properties panel and deselect node when clicking on the canvas
    if (showPropertiesPanel) {
      setShowPropertiesPanel(false);
      setSelectedNode(null);
    }
  }, [showPropertiesPanel]);

  // Close context menu on escape key
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    const handleClickOutside = () => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu]);

  const handleAddStepFromContext = useCallback(() => {
    if (contextMenu) {
      addNewStep({ x: contextMenu.flowX, y: contextMenu.flowY });
      setContextMenu(null);
    }
  }, [contextMenu, addNewStep]);

  const handleAddApprovalStep = useCallback(() => {
    if (contextMenu) {
      const newStep: FlowStep = {
        id: `step-${Date.now()}`,
        name: 'Approval',
        description: 'Human approval step',
        type: 'approval',
        parameters: {
          message: 'Please approve to continue'
        },
        next_steps: [],
        retry_count: 0,
        position: { x: contextMenu.flowX, y: contextMenu.flowY },
      };
      onStepsChange([...steps, newStep]);
      setContextMenu(null);
    }
  }, [contextMenu, steps, onStepsChange]);

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Agent Responses Panel - Now controlled by the floating tab bar at bottom-right */}
      {showResponsesPanel && (
        <AgentResponsesPanel
          responses={agentResponses}
          isOpen={showResponsesPanel}
          onToggle={() => setShowResponsesPanel(!showResponsesPanel)}
        />
      )}

      {/* Top Navbar */}
      <div className="h-14 bg-background/40 backdrop-blur-md supports-[backdrop-filter]:bg-background/30 border-b border-border/50 flex items-center justify-between px-4 z-20">
        {/* Left Side - Back button and Flow name */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard/flows')}
            className="h-8 w-8 p-0"
            title="Back to flows"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-sm font-semibold text-foreground">
            {flowName || 'Untitled Flow'}
          </span>
        </div>

        {/* Right Side - Toolbar */}
        <div className="flex items-center gap-2">
          {/* Future toolbar options can be added here */}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative">
        {/* Connection Status Indicator */}
        {(execution.isRunning || connectionState !== 'disconnected') && (
          <div className="absolute top-4 right-4 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-lg px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                connectionState === 'connected' ? 'bg-green-500' :
                connectionState === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className="text-muted-foreground">
                {connectionState === 'connected' ?
                  (execution.isRunning ? 'Live' : 'Monitoring') :
                 connectionState === 'connecting' ? 'Connecting...' :
                 'Disconnected'}
              </span>
              {currentExecutionId && (
                <span className="text-xs text-muted-foreground/70">
                  {currentExecutionId.slice(-8)}
                </span>
              )}
            </div>
          </div>
        )}

        <div ref={flowRef} className="h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView={false}
            className="bg-background"
            deleteKeyCode={null}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              className="dark:opacity-60"
            />
            <Controls />
          </ReactFlow>
        </div>

        {/* Trash Drop Zone - appears when dragging a node */}
        <TrashDropZone
          isDragging={isDragging}
          isOverTrash={isOverTrash}
          trashZoneRef={trashZoneRef}
        />

        {/* Node Context Menu - Right click on a step */}
        {nodeContextMenu && (
          <NodeContextMenu
            nodeContextMenu={nodeContextMenu}
            setNodeContextMenu={setNodeContextMenu}
            duplicateStep={duplicateStep}
            deleteStep={deleteStep}
          />
        )}

        {/* Custom Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-background border border-border rounded-md shadow-lg py-1 min-w-[120px]"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleAddStepFromContext}
              className="flex items-center w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors border-b border-border"
            >
              <Sparkles className="w-4 h-4 mr-2 text-purple-500" />
              Add Agent Step
            </button>
            <button
              onClick={handleAddApprovalStep}
              className="flex items-center w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-2 text-amber-500" />
              Add Approval Step
            </button>
          </div>
        )}

        {/* Play/Stop Workflow Toggle Button */}
        {startStepId && (
          <Button
            onClick={execution.isRunning ? stopWorkflow : runWorkflow}
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 text-white shadow-lg transition-colors ${
              execution.isRunning
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
            size="default"
          >
            {execution.isRunning ? (
              <>
                <Square className="h-4 w-4 mr-2" />
                Stop Flow
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Flow
              </>
            )}
          </Button>
        )}

        {/* Enhanced Floating Tab Bar - Bottom Center */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
          <div className="flow-node-glass border-2 border-border/50 rounded-2xl shadow-2xl p-2 flex items-center gap-2 backdrop-blur-xl">
            {/* Responses Tab */}
            <button
              onClick={() => setShowResponsesPanel(!showResponsesPanel)}
              className={`group relative px-4 py-2.5 rounded-xl transition-all duration-300 ${
                showResponsesPanel
                  ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-muted/50 text-muted-foreground'
              }`}
              title="Agent Responses"
            >
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:scale-110 transition-transform"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span className="text-xs font-medium">Responses</span>
              </div>
              {(() => {
                // Only count non-streaming responses for badge
                const completeResponses = agentResponses.filter(r => r.status !== 'streaming');
                return completeResponses.length > 0 && (
                  <div className={`absolute -top-1 -right-1 h-5 px-1.5 rounded-full flex items-center justify-center ${
                    showResponsesPanel
                      ? 'bg-blue-500'
                      : 'bg-red-500 animate-pulse'
                  }`}>
                    <span className="text-[10px] font-bold text-white">{completeResponses.length}</span>
                  </div>
                );
              })()}
            </button>

            {/* Divider */}
            <div className="h-6 w-px bg-border/50"></div>

            {/* Properties Tab */}
            <button
              onClick={() => setShowPropertiesPanel(!showPropertiesPanel)}
              className={`group relative px-4 py-2.5 rounded-xl transition-all duration-300 ${
                showPropertiesPanel
                  ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-600 dark:text-purple-400'
                  : 'hover:bg-muted/50 text-muted-foreground'
              }`}
              title="Properties"
            >
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="group-hover:scale-110 transition-transform"
                >
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M12 1v6m0 6v6"></path>
                  <path d="m4.93 4.93 4.24 4.24m5.66 5.66 4.24 4.24"></path>
                  <path d="m19.07 4.93-4.24 4.24m-5.66 5.66-4.24 4.24"></path>
                </svg>
                <span className="text-xs font-medium">Properties</span>
              </div>
              {showPropertiesPanel && (
                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Floating Toolbar - Left Side with Glassmorphism */}
      <div className="fixed left-6 top-24 z-30">
        <div className="flow-node-glass border-2 border-border/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 bg-gradient-to-r from-purple-500/10 to-blue-500/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div>
              <span className="text-xs font-semibold text-foreground">Components</span>
            </div>
          </div>

          {/* Components List */}
          <div className="p-2 space-y-1 min-w-[180px]">
            {/* Agent Button */}
            <button
              onClick={() => addNewStep({ x: 250, y: 250 })}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-purple-500/10 transition-all duration-300 text-left relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <Sparkles className="h-4 w-4 text-purple-500 group-hover:text-purple-400 sparkle-icon" />
              </div>
              <div className="relative flex-1">
                <span className="text-sm font-medium text-foreground">Agent</span>
                <p className="text-[10px] text-muted-foreground">AI-powered step</p>
              </div>
            </button>

            {/* User Approval Button */}
            <button
              onClick={() => {
                const newStep: FlowStep = {
                  id: `step-${Date.now()}`,
                  name: 'Approval',
                  description: 'Human approval step',
                  type: 'approval',
                  parameters: {
                    message: 'Please approve to continue'
                  },
                  next_steps: [],
                  retry_count: 0,
                  position: { x: 250, y: 350 },
                };
                onStepsChange([...steps, newStep]);
                toast({
                  title: "Approval Step Added",
                  description: "Human approval step has been added to the canvas",
                });
              }}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-amber-500/10 transition-all duration-300 text-left relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-4 w-4 text-amber-500 group-hover:text-amber-400" />
              </div>
              <div className="relative flex-1">
                <span className="text-sm font-medium text-foreground">Approval</span>
                <p className="text-[10px] text-muted-foreground">Human review</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Properties Panel - Floating modal style */}
      <FlowPropertiesPanel
        flowName={flowName || ''}
        flowDescription={flowDescription}
        startStepId={startStepId}
        steps={steps}
        variables={variables}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        isEditMode={isEditMode}
        onFlowNameChange={onFlowNameChange}
        onFlowDescriptionChange={onFlowDescriptionChange}
        onStartStepChange={onStartStepChange}
        onVariableUpdate={onVariableUpdate}
        onVariableDelete={onVariableDelete}
        onAddVariable={onAddVariable}
        onSave={onSave}
        onCancel={onCancel}
        selectedStep={selectedNode}
        agents={agents}
        llms={llms}
        mcpConnections={mcpConnections}
        mcpToolCounts={mcpToolCounts}
        agentsLoading={agentsLoading}
        onStepUpdate={saveNode}
        onStepDelete={selectedNode ? () => deleteStep(selectedNode.id) : undefined}
        onClose={() => {
          setShowPropertiesPanel(false);
          setSelectedNode(null);
        }}
        isVisible={showPropertiesPanel}
      />

      {/* Feedback Loop Configuration Modal */}
      <FeedbackLoopModal
        isOpen={showFeedbackLoopModal}
        onClose={() => {
          setShowFeedbackLoopModal(false);
          setFeedbackLoopConfig(null);
        }}
        onSave={handleSaveFeedbackLoop}
        onRemove={feedbackLoopConfig ? () => handleRemoveFeedbackLoop(feedbackLoopConfig.edgeId) : undefined}
        config={feedbackLoopConfig}
        sourceStepName={feedbackLoopConfig ? steps.find(s => s.id === feedbackLoopConfig.sourceStepId)?.name : undefined}
        targetStepName={feedbackLoopConfig ? steps.find(s => s.id === feedbackLoopConfig.targetStepId)?.name : undefined}
      />

      {/* Approval Modal */}
      {approvalData && (
        <ApprovalModal
          isOpen={approvalModalOpen}
          stepName={approvalData.stepName}
          approvalMessage={approvalData.approvalMessage}
          content={approvalData.content}
          onApprove={handleApprove}
          onReject={handleReject}
          isSubmitting={approvalSubmitting}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar este paso?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el paso{' '}
              <span className="font-semibold text-foreground">
                "{stepToDelete ? steps.find(s => s.id === stepToDelete)?.name : ''}"
              </span>{' '}
              y todas sus conexiones del flujo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setStepToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStep}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
