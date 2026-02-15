import React, { useState, useEffect } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { VariableEditor } from './VariableEditor';
import { Info, X, Trash2, Settings, FileText, Play, Variable, Save, XCircle, AlertCircle, Workflow, Box } from 'lucide-react';
import { Combobox } from '../ui/combobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { VariableTextarea } from './VariableTextarea';
import type { FlowStep } from '../../types/flow';
import type { Agent } from '../../types/agent';
import type { LLM } from '../../types/llm';
import type { McpServerConnection } from '../../types/mcp';

interface FlowPropertiesPanelProps {
  // Flow properties
  flowName: string;
  flowDescription: string;
  startStepId: string;
  steps: FlowStep[];
  variables: Record<string, any>;
  hasUnsavedChanges: boolean;
  saving: boolean;
  isEditMode: boolean;
  onFlowNameChange: (name: string) => void;
  onFlowDescriptionChange: (description: string) => void;
  onStartStepChange: (stepId: string) => void;
  onVariableUpdate: (oldKey: string, newKey: string, newValue: string) => void;
  onVariableDelete: (key: string) => void;
  onAddVariable: () => void;
  onSave: () => void;
  onCancel: () => void;

  // Step properties
  selectedStep: FlowStep | null;
  agents: Agent[];
  llms: LLM[];
  mcpConnections: McpServerConnection[];
  mcpToolCounts: Record<string, number>;
  agentsLoading: boolean;
  onStepUpdate: (step: FlowStep) => void;
  onStepDelete?: () => void;
  onClose: () => void;

  // Visibility
  isVisible: boolean;
}

export const FlowPropertiesPanel: React.FC<FlowPropertiesPanelProps> = ({
  flowName,
  flowDescription,
  startStepId,
  steps,
  variables,
  hasUnsavedChanges,
  saving,
  isEditMode,
  onFlowNameChange,
  onFlowDescriptionChange,
  onStartStepChange,
  onVariableUpdate,
  onVariableDelete,
  onAddVariable,
  onSave,
  onCancel,
  selectedStep,
  agents,
  llms,
  mcpConnections,
  mcpToolCounts,
  agentsLoading,
  onStepUpdate,
  onStepDelete,
  onClose,
  isVisible
}) => {
  const [activeTab, setActiveTab] = useState<'flow' | 'step'>('flow');
  const [editStepData, setEditStepData] = useState(selectedStep);

  const existingKeys = React.useMemo(() => Object.keys(variables), [variables]);

  // Auto-switch to step tab when a step is selected
  useEffect(() => {
    if (selectedStep) {
      setActiveTab('step');
      setEditStepData(selectedStep);
    }
  }, [selectedStep]);

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
  const selectedAgent = editStepData ? getAgent(editStepData.agent_id) : null;
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

  const handleStepUpdate = (field: keyof FlowStep, value: any) => {
    if (!editStepData) return;
    const updatedData = { ...editStepData, [field]: value };
    setEditStepData(updatedData);
    onStepUpdate(updatedData);
  };

  return (
    <div
      className={`fixed right-6 top-20 bottom-6 w-[440px] flow-node-glass border-2 border-border/50 rounded-2xl shadow-2xl flex flex-col z-30 transition-transform duration-300 ease-in-out backdrop-blur-xl ${
        isVisible ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'
      }`}
    >
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'flow' | 'step')} className="flex flex-col h-full rounded-2xl overflow-hidden">
        {/* Minimal Header */}
        <div className="border-b p-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Properties</h3>
                {hasUnsavedChanges && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                    Unsaved changes
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-muted rounded-lg"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Minimal TabsList */}
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="flow" className="text-xs">
              <div className="flex items-center justify-center gap-1.5">
                <Workflow className="h-3.5 w-3.5" />
                <span>Flow</span>
              </div>
            </TabsTrigger>
            <TabsTrigger value="step" className="text-xs" disabled={!selectedStep}>
              <div className="flex items-center justify-center gap-1.5">
                <Box className="h-3.5 w-3.5" />
                <span>Step</span>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Flow Properties Tab */}
          <TabsContent value="flow" className="p-5 space-y-4 mt-0">
            {/* Minimal Warning Banner */}
            {hasUnsavedChanges && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-300">Unsaved Changes</p>
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">Remember to save your flow</p>
                </div>
              </div>
            )}

            {/* Flow Name */}
            <div className="space-y-2">
              <Label htmlFor="flow-name" className="text-xs font-medium flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Flow Name
              </Label>
              <Input
                id="flow-name"
                value={flowName}
                onChange={(e) => onFlowNameChange(e.target.value)}
                placeholder="Enter flow name"
                className="text-xs h-9"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="flow-description" className="text-xs font-medium flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Description
              </Label>
              <Textarea
                id="flow-description"
                value={flowDescription}
                onChange={(e) => onFlowDescriptionChange(e.target.value)}
                placeholder="Enter flow description"
                rows={3}
                className="text-xs resize-none"
              />
            </div>

            {/* Start Step */}
            <div className="space-y-2">
              <Label htmlFor="start-step" className="text-xs font-medium flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Start Step
              </Label>
              <Select value={startStepId} onValueChange={onStartStepChange}>
                <SelectTrigger className="w-full text-xs h-9">
                  <SelectValue placeholder="Select start step" />
                </SelectTrigger>
                <SelectContent>
                  {steps.map(step => (
                    <SelectItem key={step.id} value={step.id} className="text-xs">
                      {step.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Variables */}
            <div className="space-y-2">
              <div>
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Variable className="h-3.5 w-3.5" />
                  Default Variables
                </Label>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Define variables as {`{{variable_name}}`} in flow steps
                </p>
              </div>
              <div className="space-y-2">
                {Object.entries(variables).map(([key, value]) => (
                  <VariableEditor
                    key={key}
                    initialKey={key}
                    initialValue={typeof value === 'string' ? value : JSON.stringify(value)}
                    existingKeys={existingKeys}
                    onUpdate={onVariableUpdate}
                    onDelete={onVariableDelete}
                    className="text-xs"
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddVariable}
                  className="w-full text-xs h-8 border-dashed"
                >
                  + Add Variable
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={onSave}
                disabled={saving}
                className="w-full text-xs h-9"
              >
                {saving ? (
                  <>
                    <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5 mr-2" />
                    {isEditMode ? 'Save Flow' : 'Create Flow'}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={saving}
                className="w-full text-xs h-9"
              >
                <XCircle className="h-3.5 w-3.5 mr-2" />
                Cancel
              </Button>
            </div>
          </TabsContent>

          {/* Step Properties Tab */}
          <TabsContent value="step" className="p-5 space-y-4 mt-0">
            {selectedStep && editStepData ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="step-name" className="text-sm font-medium">
                    Step Name
                  </Label>
                  <Input
                    id="step-name"
                    value={editStepData.name}
                    onChange={(e) => handleStepUpdate('name', e.target.value)}
                    placeholder="Enter step name"
                    className="nodrag text-xs h-8"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Agent</Label>
                  {agentsLoading ? (
                    <div className="h-10 w-full bg-gray-100 rounded-md flex items-center px-3">
                      <span className="text-xs text-muted-foreground">Loading agents...</span>
                    </div>
                  ) : (
                    <Combobox
                      value={editStepData.agent_id || 'none'}
                      onValueChange={(value) => {
                        const agentId = value === 'none' ? undefined : value;
                        handleStepUpdate('agent_id', agentId);
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
                      className="w-full nodrag text-xs"
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
                            <span className="font-medium text-xs">{agent?.name || option.label}</span>
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
                          <p className="text-xs">Flow descriptions help steps and agents know what to output</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <VariableTextarea
                    value={editStepData.description || ''}
                    onChange={(value) => handleStepUpdate('description', value)}
                    variables={variables}
                    className="text-xs resize-none nodrag"
                    rows={4}
                    placeholder="Enter description for this step..."
                  />
                </div>

                {selectedAgent && (
                  <div className="space-y-2">
                    <Label htmlFor="system-prompt" className="text-sm font-medium">
                      System Prompt (from Agent)
                    </Label>
                    <Textarea
                      id="system-prompt"
                      value={selectedAgent.description}
                      readOnly
                      className="text-xs bg-muted/50"
                      rows={3}
                      placeholder="No agent selected"
                    />
                  </div>
                )}

                {agentMcpConnections.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">MCP Connections</Label>
                    <div className="flex flex-wrap gap-2">
                      {agentMcpConnections.map(conn => {
                        const toolCount = mcpToolCounts[conn.id] || 0;
                        return (
                          <div
                            key={conn.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded-md bg-background text-foreground"
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
                        {editStepData.agent_overrides?.llm_id && (
                          <span className="ml-2 text-xs text-blue-600 font-normal">• Custom</span>
                        )}
                      </Label>
                      <Combobox
                        value={editStepData.agent_overrides?.llm_id || 'default'}
                        onValueChange={(value) => {
                          const overrides = editStepData.agent_overrides || {};
                          if (value === 'default') {
                            // Remove override
                            const { llm_id, ...rest } = overrides;
                            handleStepUpdate('agent_overrides', Object.keys(rest).length > 0 ? rest : null);
                          } else {
                            // Set override
                            handleStepUpdate('agent_overrides', { ...overrides, llm_id: value });
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
                        className="w-full nodrag text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        {editStepData.agent_overrides?.llm_id
                          ? `Using custom LLM for this step`
                          : `Using agent's default LLM`}
                      </p>
                    </div>

                    {/* MCP Connections Override */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        MCP Connections Override
                        {editStepData.agent_overrides?.mcp_connections && (
                          <span className="ml-2 text-xs text-blue-600 font-normal">• Custom</span>
                        )}
                      </Label>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full nodrag text-xs h-8"
                          onClick={() => {
                            const overrides = editStepData.agent_overrides || {};
                            if (overrides.mcp_connections) {
                              // Remove override
                              const { mcp_connections, ...rest } = overrides;
                              handleStepUpdate('agent_overrides', Object.keys(rest).length > 0 ? rest : null);
                            } else {
                              // Initialize with agent's default
                              handleStepUpdate('agent_overrides', {
                                ...overrides,
                                mcp_connections: selectedAgent.mcp_connections || []
                              });
                            }
                          }}
                        >
                          {editStepData.agent_overrides?.mcp_connections
                            ? 'Reset to Agent Default'
                            : 'Customize MCPs'}
                        </Button>

                        {editStepData.agent_overrides?.mcp_connections && (
                          <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground mb-2">
                              Select which MCP connections to use for this step:
                            </p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {mcpConnections.map(conn => {
                                const isSelected = editStepData.agent_overrides?.mcp_connections?.includes(conn.id);
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
                                        const overrides = editStepData.agent_overrides || {};
                                        const currentConnections = overrides.mcp_connections || [];
                                        const newConnections = e.target.checked
                                          ? [...currentConnections, conn.id]
                                          : currentConnections.filter(id => id !== conn.id);
                                        handleStepUpdate('agent_overrides', {
                                          ...overrides,
                                          mcp_connections: newConnections
                                        });
                                      }}
                                      className="rounded"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium">{conn.name}</span>
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
                        {editStepData.agent_overrides?.mcp_connections
                          ? `Using ${editStepData.agent_overrides.mcp_connections.length} custom MCP connection(s)`
                          : `Using agent's default MCP connections`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Delete Step Button */}
                {onStepDelete && (
                  <div className="pt-4 border-t border-border flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={onStepDelete}
                      className="h-8 w-8 p-0"
                      title="Delete step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Select a step to view its properties
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
