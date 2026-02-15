import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Play, 
  Wrench, 
  Code2, 
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MCPToolInfo, MCPToolExecuteRequest, MCPToolExecuteResponse } from '@/types/mcp';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';

interface McpToolsListProps {
  connectionId: string;
  connectionName: string;
  tools: MCPToolInfo[];
  onRefresh: () => void;
  isLoading?: boolean;
}

export const McpToolsList: React.FC<McpToolsListProps> = ({
  connectionId,
  connectionName,
  tools,
  onRefresh,
  isLoading = false
}) => {
  const { toast } = useToast();
  const [executeDialogOpen, setExecuteDialogOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<MCPToolInfo | null>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<MCPToolExecuteResponse | null>(null);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const handleExecuteTool = (tool: MCPToolInfo) => {
    setSelectedTool(tool);
    setParameters({});
    setExecutionResult(null);
    setExecuteDialogOpen(true);
  };

  const handleParameterChange = (paramName: string, value: any) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const executeSelectedTool = async () => {
    if (!selectedTool) return;

    setIsExecuting(true);
    try {
      const request: MCPToolExecuteRequest = {
        tool_name: selectedTool.name,
        parameters
      };

      const result = await mcpServerConnectionsApi.executeTool(connectionId, request);
      setExecutionResult(result);

      if (result.success) {
        toast({
          title: "Tool executed successfully",
          description: `${selectedTool.name} completed in ${result.execution_time_ms}ms`,
        });
      } else {
        toast({
          title: "Tool execution failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Execution error",
        description: "Failed to execute tool",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const renderParameterInput = (paramName: string, paramInfo: any) => {
    const paramType = paramInfo.type || 'string';
    const paramDescription = paramInfo.description || '';
    
    switch (paramType) {
      case 'boolean':
        return (
          <div key={paramName} className="space-y-2">
            <label className="text-sm font-medium">{paramName}</label>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={parameters[paramName] || false}
                onChange={(e) => handleParameterChange(paramName, e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-muted-foreground">{paramDescription}</span>
            </div>
          </div>
        );
      case 'number':
      case 'integer':
        return (
          <div key={paramName} className="space-y-2">
            <label className="text-sm font-medium">{paramName}</label>
            <Input
              type="number"
              placeholder={paramDescription}
              value={parameters[paramName] || ''}
              onChange={(e) => handleParameterChange(paramName, parseFloat(e.target.value) || 0)}
            />
          </div>
        );
      case 'array':
        return (
          <div key={paramName} className="space-y-2">
            <label className="text-sm font-medium">{paramName}</label>
            <Textarea
              placeholder={`${paramDescription} (JSON array format)`}
              value={parameters[paramName] ? JSON.stringify(parameters[paramName]) : ''}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  handleParameterChange(paramName, parsed);
                } catch {
                  // Invalid JSON, keep as string for now
                }
              }}
              className="min-h-[80px]"
            />
          </div>
        );
      default:
        return (
          <div key={paramName} className="space-y-2">
            <label className="text-sm font-medium">{paramName}</label>
            <Input
              placeholder={paramDescription}
              value={parameters[paramName] || ''}
              onChange={(e) => handleParameterChange(paramName, e.target.value)}
            />
          </div>
        );
    }
  };

  const toggleToolExpansion = (toolName: string) => {
    setExpandedTool(expandedTool === toolName ? null : toolName);
  };

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No tools discovered</p>
          <p className="text-sm text-muted-foreground mt-2">
            This MCP server doesn't expose any tools, or they haven't been discovered yet.
          </p>
          <Button variant="outline" onClick={onRefresh} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Available Tools</h3>
          <p className="text-sm text-muted-foreground">
            {tools.length} tool{tools.length !== 1 ? 's' : ''} from {connectionName}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {tools.map((tool) => (
          <Card key={tool.name} className="border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-auto"
                    onClick={() => toggleToolExpansion(tool.name)}
                  >
                    {expandedTool === tool.name ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <Code2 className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-base">{tool.name}</CardTitle>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDistanceToNow(new Date(tool.discovered_at), { addSuffix: true })}
                  </Badge>
                  <Button size="sm" onClick={() => handleExecuteTool(tool)}>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </Button>
                </div>
              </div>
              <CardDescription>{tool.description || 'No description available'}</CardDescription>
            </CardHeader>
            
            {expandedTool === tool.name && (
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Parameters</h4>
                    {Object.keys(tool.input_schema.properties || {}).length > 0 ? (
                      <div className="bg-muted p-3 rounded-md">
                        <pre className="text-xs overflow-x-auto">
                          {JSON.stringify(tool.input_schema, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No parameters required</p>
                    )}
                  </div>
                  
                  {tool.input_schema.required && tool.input_schema.required.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Required Parameters</h4>
                      <div className="flex flex-wrap gap-1">
                        {tool.input_schema.required.map((param) => (
                          <Badge key={param} variant="secondary" className="text-xs">
                            {param}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Execute Tool Dialog */}
      <Dialog open={executeDialogOpen} onOpenChange={setExecuteDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execute Tool: {selectedTool?.name}</DialogTitle>
            <DialogDescription>
              {selectedTool?.description || 'Configure parameters and execute this tool'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedTool && Object.keys(selectedTool.input_schema.properties || {}).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Parameters</h4>
                <div className="space-y-3">
                  {Object.entries(selectedTool.input_schema.properties || {}).map(([paramName, paramInfo]) =>
                    renderParameterInput(paramName, paramInfo)
                  )}
                </div>
              </div>
            )}

            {executionResult && (
              <div className="border-t pt-4">
                <div className="flex items-center space-x-2 mb-3">
                  {executionResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <h4 className="text-sm font-medium">
                    {executionResult.success ? 'Success' : 'Error'}
                  </h4>
                  {executionResult.execution_time_ms && (
                    <Badge variant="outline" className="text-xs">
                      {executionResult.execution_time_ms}ms
                    </Badge>
                  )}
                </div>
                
                <div className="bg-muted p-3 rounded-md">
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {executionResult.success 
                      ? JSON.stringify(executionResult.result, null, 2)
                      : executionResult.error
                    }
                  </pre>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setExecuteDialogOpen(false)}
              disabled={isExecuting}
            >
              Close
            </Button>
            <Button onClick={executeSelectedTool} disabled={isExecuting}>
              {isExecuting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              {isExecuting ? 'Executing...' : 'Execute Tool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};