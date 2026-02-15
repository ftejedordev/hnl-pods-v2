import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  XCircle,
  Activity,
  Terminal,
  Settings
} from 'lucide-react';
import type { FlowExecution, FlowExecutionEvent } from '../../types/flow';
import { executionsApi, getStatusColor, type SSEConnection } from '../../api/flows';
import { formatDistance } from 'date-fns';
import { AgentOutput } from '../common/AgentOutput';

interface FlowExecutionMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  execution: FlowExecution | null;
  onClose?: () => void;
}

export const FlowExecutionMonitor: React.FC<FlowExecutionMonitorProps> = ({
  open,
  onOpenChange,
  execution,
  onClose: _onClose
}) => {
  const [currentExecution, setCurrentExecution] = useState<FlowExecution | null>(execution);
  const [events, setEvents] = useState<FlowExecutionEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<SSEConnection | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (execution && open) {
      setCurrentExecution(execution);
      setEvents([]);
      connectToEventStream(execution.id);
      
      return () => {
        disconnectFromEventStream();
      };
    }
  }, [execution, open]);

  useEffect(() => {
    // Auto-scroll to bottom when new events arrive
    if (eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  const connectToEventStream = (executionId: string) => {
    disconnectFromEventStream();
    
    try {
      const eventSource = executionsApi.subscribeToExecutionEvents(
        executionId,
        (event: FlowExecutionEvent) => {
          setEvents(prev => [...prev, event]);
          
          // Update execution status based on events
          if (event.event_type === 'execution_completed' || 
              event.event_type === 'execution_failed' || 
              event.event_type === 'execution_cancelled') {
            refreshExecution(executionId);
          }
        },
        (error: Error) => {
          console.error('SSE error:', error);
          setIsConnected(false);
        }
      );
      
      eventSourceRef.current = eventSource;
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect to event stream:', error);
      setIsConnected(false);
    }
  };

  const disconnectFromEventStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  };

  const refreshExecution = async (executionId: string) => {
    try {
      const updatedExecution = await executionsApi.getExecution(executionId);
      setCurrentExecution(updatedExecution);
    } catch (error) {
      console.error('Failed to refresh execution:', error);
    }
  };

  const cancelExecution = async () => {
    if (!currentExecution) return;
    
    try {
      await executionsApi.cancelExecution(currentExecution.id);
      await refreshExecution(currentExecution.id);
    } catch (error) {
      console.error('Failed to cancel execution:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'running': return <Play className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'failed': return <AlertCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'execution_started': return <Play className="w-4 h-4 text-blue-500" />;
      case 'execution_completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'execution_failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'execution_cancelled': return <XCircle className="w-4 h-4 text-muted-foreground" />;
      case 'step_started': return <Play className="w-4 h-4 text-blue-500" />;
      case 'step_completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'step_failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'step_skipped': return <XCircle className="w-4 h-4 text-muted-foreground" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatEventTime = (timestamp: string) => {
    return formatDistance(new Date(timestamp), new Date(), { addSuffix: true });
  };

  const getExecutionDuration = () => {
    if (!currentExecution) return null;
    
    if (currentExecution.execution_time_ms) {
      return `${currentExecution.execution_time_ms}ms`;
    }
    
    if (currentExecution.start_time) {
      const start = new Date(currentExecution.start_time);
      const end = currentExecution.end_time ? new Date(currentExecution.end_time) : new Date();
      return `${Math.round((end.getTime() - start.getTime()) / 1000)}s`;
    }
    
    return null;
  };

  if (!currentExecution) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Flow Execution Monitor
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          {/* Execution Overview */}
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Execution Status</CardTitle>
              <CardDescription>
                {currentExecution.flow_id}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${getStatusColor(currentExecution.status)}`}>
                  {getStatusIcon(currentExecution.status)}
                  <span className="text-sm font-medium">{currentExecution.status}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Started:</span>{' '}
                  {currentExecution.start_time ? 
                    formatDistance(new Date(currentExecution.start_time), new Date(), { addSuffix: true }) :
                    'Not started'
                  }
                </div>
                
                {getExecutionDuration() && (
                  <div>
                    <span className="font-medium">Duration:</span> {getExecutionDuration()}
                  </div>
                )}
                
                <div>
                  <span className="font-medium">Completed Steps:</span> {currentExecution.completed_steps.length}
                </div>
                
                <div>
                  <span className="font-medium">Failed Steps:</span> {currentExecution.failed_steps.length}
                </div>
                
                {currentExecution.current_step_id && (
                  <div>
                    <span className="font-medium">Current Step:</span>{' '}
                    <Badge variant="outline">{currentExecution.current_step_id}</Badge>
                  </div>
                )}
              </div>
              
              {currentExecution.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <div className="text-sm font-medium text-red-800">Error:</div>
                  <div className="text-sm text-red-700 mt-1">{currentExecution.error}</div>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refreshExecution(currentExecution.id)}
                  disabled={!isConnected}
                >
                  Refresh
                </Button>
                {currentExecution.status === 'running' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelExecution}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Events and Details */}
          <div className="md:col-span-2">
            <Tabs defaultValue="events" className="h-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="events">
                  <Terminal className="w-4 h-4 mr-2" />
                  Events
                </TabsTrigger>
                <TabsTrigger value="steps">
                  <Activity className="w-4 h-4 mr-2" />
                  Steps
                </TabsTrigger>
                <TabsTrigger value="data">
                  <Settings className="w-4 h-4 mr-2" />
                  Data
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="events" className="h-[50vh]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Event Log</CardTitle>
                    <CardDescription>
                      Real-time execution events ({events.length} events)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[40vh] pr-4">
                      <div className="space-y-3">
                        {events.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No events yet. Waiting for execution to start...
                          </div>
                        ) : (
                          events.map((event, index) => (
                            <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-md">
                              <div className="flex-shrink-0 mt-0.5">
                                {getEventIcon(event.event_type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium">{event.event_type}</span>
                                  {event.step_id && (
                                    <Badge variant="outline" className="text-xs">
                                      {event.step_id}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground mt-1">{event.message}</div>
                                {Object.keys(event.data).length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-1 font-mono">
                                    {JSON.stringify(event.data, null, 2)}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground mt-1">
                                  {formatEventTime(event.timestamp)}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={eventsEndRef} />
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="steps" className="h-[50vh]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Step Results</CardTitle>
                    <CardDescription>
                      Detailed results from each step
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[40vh] pr-4">
                      <div className="space-y-3">
                        {Object.entries(currentExecution.step_results).map(([stepId, result]) => (
                          <div key={stepId} className="p-3 border rounded-md">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{stepId}</Badge>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${getStatusColor(result.status)}`}>
                                {getStatusIcon(result.status)}
                                <span className="text-xs font-medium">{result.status}</span>
                              </div>
                            </div>
                            
                            {result.agent_output && (
                              <div className="mt-2">
                                <div className="text-sm font-medium mb-1">Agent Output:</div>
                                <AgentOutput 
                                  output={result.agent_output} 
                                  toolResults={result.tool_results}
                                />
                              </div>
                            )}
                            
                            {result.tool_calls && result.tool_calls.length > 0 && (
                              <div className="mt-2">
                                <div className="text-sm font-medium mb-1">Tool Calls:</div>
                                <div className="space-y-2">
                                  {result.tool_calls.map((toolCall, index) => (
                                    <div key={index} className="text-sm bg-blue-50 border border-blue-200 p-2 rounded">
                                      <div className="font-medium text-blue-800">
                                        {toolCall.function.name}
                                      </div>
                                      <div className="text-blue-700 mt-1">
                                        {JSON.stringify(toolCall.function.arguments, null, 2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {result.tool_results && result.tool_results.length > 0 && (
                              <div className="mt-2">
                                <div className="text-sm font-medium mb-1">Tool Results:</div>
                                <div className="space-y-2">
                                  {result.tool_results.map((toolResult, index) => (
                                    <div key={index} className="text-sm bg-green-50 border border-green-200 p-2 rounded">
                                      <div className="font-medium text-green-800">
                                        {toolResult.tool_name}
                                      </div>
                                      <div className="text-green-700 mt-1">
                                        {Array.isArray(toolResult.result) ? (
                                          toolResult.result.map((item, i) => (
                                            <div key={i} className="mb-1">
                                              {item.type === 'text' ? item.text : JSON.stringify(item)}
                                            </div>
                                          ))
                                        ) : (
                                          JSON.stringify(toolResult.result)
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {result.error && (
                              <div className="mt-2">
                                <div className="text-sm font-medium mb-1 text-red-700">Error:</div>
                                <div className="text-sm bg-red-50 p-2 rounded text-red-700">
                                  {result.error}
                                </div>
                              </div>
                            )}
                            
                            <div className="text-xs text-muted-foreground mt-2 space-y-1">
                              {result.execution_time_ms && (
                                <div>Execution time: {result.execution_time_ms}ms</div>
                              )}
                              {result.model_used && (
                                <div>Model: {result.model_used}</div>
                              )}
                              {result.agent_name && (
                                <div>Agent: {result.agent_name}</div>
                              )}
                              {result.latency_ms && (
                                <div>LLM Latency: {result.latency_ms}ms</div>
                              )}
                              {result.usage && (
                                <div>Usage: {JSON.stringify(result.usage)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {Object.keys(currentExecution.step_results).length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            No step results yet
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="data" className="h-[50vh]">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Execution Data</CardTitle>
                    <CardDescription>
                      Input data and variables
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[40vh] pr-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Input Data</h4>
                          <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
                            {JSON.stringify(currentExecution.input_data, null, 2)}
                          </pre>
                        </div>
                        
                        <div>
                          <h4 className="font-medium mb-2">Variables</h4>
                          <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
                            {JSON.stringify(currentExecution.variables, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};