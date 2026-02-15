import React, { useState, useEffect } from 'react';
import { X, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Combobox } from '../ui/combobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { VariableTextarea } from './VariableTextarea';
import type { FlowStep } from '../../types/flow';
import type { Agent } from '../../types/agent';
import type { LLM } from '../../types/llm';
import type { McpServerConnection } from '../../types/mcp';

interface NodePropertiesPanelProps {
  step: FlowStep;
  agents: Agent[];
  llms: LLM[];
  mcpConnections: McpServerConnection[];
  mcpToolCounts: Record<string, number>;
  agentsLoading: boolean;
  variables: Record<string, any>;
  onUpdate: (step: FlowStep) => void;
  onClose: () => void;
}

export const NodePropertiesPanel: React.FC<NodePropertiesPanelProps> = ({
  step,
  agents,
  llms,
  mcpConnections,
  mcpToolCounts,
  agentsLoading,
  variables,
  onUpdate,
  onClose
}) => {
  const [editData, setEditData] = useState(step);

  useEffect(() => {
    setEditData(step);
  }, [step]);

  // Helper function to get agent by ID
  const getAgent = (agentId: string | undefined) => {
    if (!agentId) return null;
    return agents.find(agent => agent.id === agentId);
  };

  // Helper function to get LLM by ID
  const getLLM = (llmId: string | undefined) => {
    if (!llmId) return null;
    return llms.find(llm => llm.id === llmId);
  };

  // Get the selected agent and its LLM
  const selectedAgent = getAgent(editData.agent_id);
  const selectedLLM = selectedAgent ? getLLM(selectedAgent.llm_id) : null;

  // Get MCP connections for the selected agent
  const getAgentMcpConnections = () => {
    if (!selectedAgent || !selectedAgent.mcp_connections || !mcpConnections) {
      return [];
    }
    return mcpConnections.filter(conn =>
      selectedAgent.mcp_connections?.includes(conn.id)
    );
  };

  const agentMcpConnections = getAgentMcpConnections();

  const handleUpdate = (field: keyof FlowStep, value: any) => {
    const updatedData = { ...editData, [field]: value };
    setEditData(updatedData);
    onUpdate(updatedData);
  };

  return (
    <div
      className="fixed right-0 top-0 w-[420px] h-full bg-background border-l border-border shadow-lg z-50 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-background border-b border-border p-4 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Step Properties</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Step Name */}
        <div className="space-y-2">
          <Label htmlFor="step-name" className="text-sm font-medium">
            Step Name
          </Label>
          <Input
            id="step-name"
            value={editData.name}
            onChange={(e) => handleUpdate('name', e.target.value)}
            placeholder="Enter step name"
            className="nodrag"
          />
        </div>

        {/* Agent Selector */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Agent</Label>
          {agentsLoading ? (
            <div className="h-10 w-full bg-gray-100 rounded-md flex items-center px-3">
              <span className="text-sm text-muted-foreground">Loading agents...</span>
            </div>
          ) : (
            <Combobox
              value={editData.agent_id || 'none'}
              onValueChange={(value) => {
                const agentId = value === 'none' ? undefined : value;
                handleUpdate('agent_id', agentId);
              }}
              options={[
                { value: 'none', label: 'No Agent' },
                ...agents.map(agent => ({
                  value: agent.id,
                  label: agent.name,
                  data: agent,
                  disabled: !agent.llm_id,
                  tooltip: !agent.llm_id ? 'First assign an LLM to this agent' : undefined
                }))
              ]}
              placeholder="Select Agent"
              searchPlaceholder="Search agents..."
              className="w-full nodrag"
              renderOption={(option) => {
                if (option.value === 'none') {
                  return <span>No Agent</span>;
                }
                const agent = option.data;
                return (
                  <div className="flex items-center space-x-2">
                    {agent?.avatar_url ? (
                      <img
                        src={agent.avatar_url}
                        alt={`${agent.name} avatar`}
                        className="h-4 w-4 rounded-full object-cover ring-1 ring-border"
                        style={{ borderColor: agent.color || '#3B82F6' }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div
                      className={`h-4 w-4 rounded-full flex items-center justify-center ring-1 ring-border ${agent?.avatar_url ? 'hidden' : ''}`}
                      style={{ backgroundColor: agent?.color || '#3B82F6' }}
                    >
                      <span className="text-white text-xs font-medium">
                        {agent?.name?.charAt(0) || '?'}
                      </span>
                    </div>
                    <span className="font-medium">{agent?.name || option.label}</span>
                  </div>
                );
              }}
            />
          )}
          {selectedLLM && (
            <p className="text-xs text-muted-foreground">
              LLM: {selectedLLM.name} ({selectedLLM.provider})
            </p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label htmlFor="step-description" className="text-sm font-medium">
              Description
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Flow descriptions help steps and agents know what to output and what to expect from connected agents</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <VariableTextarea
            value={editData.description || ''}
            onChange={(value) => handleUpdate('description', value)}
            variables={variables}
            className="text-sm resize-none nodrag"
            rows={6}
            placeholder="Enter description for this step..."
          />
        </div>

        {/* System Prompt (from Agent) */}
        {selectedAgent && (
          <div className="space-y-2">
            <Label htmlFor="system-prompt" className="text-sm font-medium">
              System Prompt (from Agent)
            </Label>
            <Textarea
              id="system-prompt"
              value={selectedAgent.description}
              readOnly
              className="text-sm bg-muted/50"
              rows={4}
              placeholder="No agent selected"
            />
          </div>
        )}

        {/* MCP Connections */}
        {agentMcpConnections.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">MCP Connections (from Agent)</Label>
            <div className="flex flex-wrap gap-2">
              {agentMcpConnections.map(conn => {
                const toolCount = mcpToolCounts[conn.id] || 0;
                return (
                  <div
                    key={conn.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md bg-background text-foreground"
                  >
                    <span className="font-medium">{conn.name}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{toolCount} tools</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Agent Overrides Section */}
        {selectedAgent && (
          <div className="pt-4 border-t border-border space-y-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Override Agent Config (This Step Only)</h4>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Customize the agent's LLM and MCP connections specifically for this step.
                      Leave empty to use the agent's default configuration.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* LLM Override */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                LLM Model Override
                {editData.agent_overrides?.llm_id && (
                  <span className="ml-2 text-xs text-blue-600 font-normal">• Custom</span>
                )}
              </Label>
              <Combobox
                value={editData.agent_overrides?.llm_id || 'default'}
                onValueChange={(value) => {
                  const overrides = editData.agent_overrides || {};
                  if (value === 'default') {
                    // Remove override
                    const { llm_id, ...rest } = overrides;
                    handleUpdate('agent_overrides', Object.keys(rest).length > 0 ? rest : null);
                  } else {
                    // Set override
                    handleUpdate('agent_overrides', { ...overrides, llm_id: value });
                  }
                }}
                options={[
                  {
                    value: 'default',
                    label: `Use Agent Default${selectedLLM ? ` (${selectedLLM.name})` : ''}`
                  },
                  ...llms.map(llm => ({
                    value: llm.id,
                    label: `${llm.name} - ${llm.provider}`,
                    data: llm
                  }))
                ]}
                placeholder="Select LLM"
                searchPlaceholder="Search LLMs..."
                className="w-full nodrag"
              />
              <p className="text-xs text-muted-foreground">
                {editData.agent_overrides?.llm_id
                  ? `Using custom LLM for this step`
                  : `Using agent's default LLM`}
              </p>
            </div>

            {/* MCP Connections Override */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                MCP Connections Override
                {editData.agent_overrides?.mcp_connections && (
                  <span className="ml-2 text-xs text-blue-600 font-normal">• Custom</span>
                )}
              </Label>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full nodrag"
                  onClick={() => {
                    const overrides = editData.agent_overrides || {};
                    if (overrides.mcp_connections) {
                      // Remove override
                      const { mcp_connections, ...rest } = overrides;
                      handleUpdate('agent_overrides', Object.keys(rest).length > 0 ? rest : null);
                    } else {
                      // Initialize with agent's default
                      handleUpdate('agent_overrides', {
                        ...overrides,
                        mcp_connections: selectedAgent.mcp_connections || []
                      });
                    }
                  }}
                >
                  {editData.agent_overrides?.mcp_connections
                    ? 'Reset to Agent Default'
                    : 'Customize MCPs'}
                </Button>

                {editData.agent_overrides?.mcp_connections && (
                  <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-2">
                      Select which MCP connections to use for this step:
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {mcpConnections.map(conn => {
                        const isSelected = editData.agent_overrides?.mcp_connections?.includes(conn.id);
                        const toolCount = mcpToolCounts[conn.id] || 0;
                        return (
                          <label
                            key={conn.id}
                            className="flex items-center gap-2 p-2 hover:bg-background rounded cursor-pointer nodrag"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const overrides = editData.agent_overrides || {};
                                const currentConnections = overrides.mcp_connections || [];
                                const newConnections = e.target.checked
                                  ? [...currentConnections, conn.id]
                                  : currentConnections.filter(id => id !== conn.id);
                                handleUpdate('agent_overrides', {
                                  ...overrides,
                                  mcp_connections: newConnections
                                });
                              }}
                              className="rounded"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{conn.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {toolCount} tools
                                </span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {editData.agent_overrides?.mcp_connections
                  ? `Using ${editData.agent_overrides.mcp_connections.length} custom MCP connection(s)`
                  : `Using agent's default MCP connections`}
              </p>
            </div>
          </div>
        )}

        {/* Additional Configuration Options */}
        <div className="pt-4 border-t border-border space-y-4">
          <h4 className="text-sm font-semibold">Additional Configuration</h4>

          <div className="space-y-2">
            <Label htmlFor="retry-count" className="text-sm font-medium">
              Retry Count
            </Label>
            <Input
              id="retry-count"
              type="number"
              min="0"
              max="10"
              value={editData.retry_count || 0}
              onChange={(e) => handleUpdate('retry_count', parseInt(e.target.value) || 0)}
              className="nodrag"
            />
            <p className="text-xs text-muted-foreground">
              Number of times to retry if the step fails
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeout" className="text-sm font-medium">
              Timeout (seconds)
            </Label>
            <Input
              id="timeout"
              type="number"
              min="1"
              max="3600"
              value={editData.timeout_seconds || 300}
              onChange={(e) => handleUpdate('timeout_seconds', parseInt(e.target.value) || 300)}
              className="nodrag"
            />
            <p className="text-xs text-muted-foreground">
              Maximum time to wait for step completion
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
