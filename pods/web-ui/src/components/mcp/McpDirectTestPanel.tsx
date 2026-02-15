import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, TestTube, Wrench, Plus, X } from 'lucide-react';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';

const testSchema = z.object({
  transport_type: z.enum(['stdio', 'sse']),
  // Stdio fields
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  // SSE fields
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
}).refine((data) => {
  if (data.transport_type === 'stdio') {
    return data.command && data.command.length > 0;
  }
  if (data.transport_type === 'sse') {
    return data.url && data.url.length > 0;
  }
  return true;
}, {
  message: 'Please provide the required fields for the selected transport type',
  path: ['transport_type']
});

type TestFormData = z.infer<typeof testSchema>;

export const McpDirectTestPanel: React.FC = () => {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<any>(null);
  const [args, setArgs] = useState<string[]>([]);
  const [headers, setHeaders] = useState<Array<{key: string, value: string}>>([]);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [toolArguments, setToolArguments] = useState<string>('{}');

  const form = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      transport_type: 'stdio',
      command: '',
      args: [],
      url: '',
      headers: {},
    },
  });

  const watchTransportType = form.watch('transport_type');

  const addArg = () => {
    setArgs([...args, '']);
  };

  const updateArg = (index: number, value: string) => {
    const newArgs = [...args];
    newArgs[index] = value;
    setArgs(newArgs);
    form.setValue('args', newArgs);
  };

  const removeArg = (index: number) => {
    const newArgs = args.filter((_, i) => i !== index);
    setArgs(newArgs);
    form.setValue('args', newArgs);
  };

  const addHeader = () => {
    setHeaders([...headers, { key: '', value: '' }]);
  };

  const updateHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...headers];
    newHeaders[index][field] = value;
    setHeaders(newHeaders);
    
    // Convert to object format for form
    const headersObject = newHeaders.reduce((acc, {key, value}) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    form.setValue('headers', headersObject);
  };

  const removeHeader = (index: number) => {
    const newHeaders = headers.filter((_, i) => i !== index);
    setHeaders(newHeaders);
    
    // Convert to object format for form
    const headersObject = newHeaders.reduce((acc, {key, value}) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    form.setValue('headers', headersObject);
  };

  const handleConnect = async (data: TestFormData) => {
    setIsConnecting(true);
    setConnectionResult(null);

    try {
      let result;
      
      if (data.transport_type === 'stdio') {
        result = await mcpServerConnectionsApi.connectStdio(
          data.command || '',
          args
        );
      } else {
        result = await mcpServerConnectionsApi.connectSSE(data.url || '', data.headers || {});
      }

      setConnectionResult(result);
      toast({
        title: "Connection successful",
        description: `Connected via ${result.transport}. Found ${result.total_tools} tools and ${result.total_resources} resources.`,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Connection failed';
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleTestConnection = async (data: TestFormData) => {
    setIsTesting(true);

    try {
      const config = data.transport_type === 'stdio' 
        ? { command: data.command, args }
        : { url: data.url, headers: data.headers || {} };

      const result = await mcpServerConnectionsApi.testMCPConnection(
        data.transport_type,
        config
      );

      toast({
        title: result.success ? "Test successful" : "Test failed",
        description: result.success 
          ? `Connection test passed via ${result.transport}`
          : result.error || "Connection test failed",
        variant: result.success ? "default" : "destructive",
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Test failed';
      toast({
        title: "Test failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;

    setIsExecuting(true);

    try {
      const data = form.getValues();
      const config = data.transport_type === 'stdio' 
        ? { command: data.command, args, arguments: JSON.parse(toolArguments) }
        : { url: data.url, headers: data.headers || {}, arguments: JSON.parse(toolArguments) };

      const result = await mcpServerConnectionsApi.executeMCPTool(
        data.transport_type,
        selectedTool.name,
        config
      );

      toast({
        title: result.success ? "Tool executed successfully" : "Tool execution failed",
        description: result.success 
          ? `Tool ${result.tool_name} executed via ${result.transport}`
          : result.error || "Tool execution failed",
        variant: result.success ? "default" : "destructive",
      });

      if (result.success && result.result) {
        console.log('Tool execution result:', result.result);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Tool execution failed';
      toast({
        title: "Tool execution failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          Direct MCP Testing (like main2.py)
        </CardTitle>
        <CardDescription>
          Test MCP connections directly without saving them. Great for quick tests and development.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <div className="space-y-4">
            {/* Transport Type Selection */}
            <FormField
              control={form.control}
              name="transport_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transport Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select transport type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="stdio">Standard I/O (stdio)</SelectItem>
                      <SelectItem value="sse">Server-Sent Events (SSE)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Stdio Fields */}
            {watchTransportType === 'stdio' && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Command</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="python server.py or /path/to/mcp-server" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Arguments (Optional)</FormLabel>
                  <div className="space-y-2">
                    {args.map((arg, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={arg}
                          onChange={(e) => updateArg(index, e.target.value)}
                          placeholder={`Argument ${index + 1}`}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeArg(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addArg}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Argument
                  </Button>
                </div>
              </div>
            )}

            {/* SSE Fields */}
            {watchTransportType === 'sse' && (
              <>
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SSE URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="http://localhost:8080/sse" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Custom Headers (Optional)</FormLabel>
                  <div className="space-y-2">
                    {headers.map((header, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={header.key}
                          onChange={(e) => updateHeader(index, 'key', e.target.value)}
                          placeholder="Header name (e.g., Authorization)"
                          className="flex-1"
                        />
                        <Input
                          value={header.value}
                          onChange={(e) => updateHeader(index, 'value', e.target.value)}
                          placeholder="Header value (e.g., Bearer token123)"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeHeader(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addHeader}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Header
                  </Button>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleTestConnection(form.getValues())}
                disabled={isTesting}
              >
                {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <TestTube className="mr-2 h-4 w-4" />
                Test Connection
              </Button>
              
              <Button
                type="button"
                onClick={() => handleConnect(form.getValues())}
                disabled={isConnecting}
              >
                {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Play className="mr-2 h-4 w-4" />
                Connect & Discover
              </Button>
            </div>

            {/* Results */}
            {connectionResult && (
              <Tabs defaultValue="tools" className="w-full">
                <TabsList>
                  <TabsTrigger value="tools">Tools ({connectionResult.total_tools})</TabsTrigger>
                  <TabsTrigger value="resources">Resources ({connectionResult.total_resources})</TabsTrigger>
                  <TabsTrigger value="info">Server Info</TabsTrigger>
                </TabsList>
                
                <TabsContent value="tools" className="space-y-4">
                  <div className="grid gap-2 max-h-64 overflow-y-auto">
                    {connectionResult.tools.map((tool: any, index: number) => (
                      <div 
                        key={index} 
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedTool?.name === tool.name ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedTool(tool)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{tool.name}</h4>
                            <p className="text-sm text-muted-foreground">{tool.description}</p>
                          </div>
                          <Badge variant="outline">Tool</Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTool && (
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="font-medium flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Execute: {selectedTool.name}
                      </h4>
                      
                      <div>
                        <FormLabel>Arguments (JSON)</FormLabel>
                        <Textarea
                          value={toolArguments}
                          onChange={(e) => setToolArguments(e.target.value)}
                          placeholder='{"param": "value"}'
                          className="font-mono text-sm"
                        />
                      </div>

                      <Button
                        onClick={handleExecuteTool}
                        disabled={isExecuting}
                        className="w-full"
                      >
                        {isExecuting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Play className="mr-2 h-4 w-4" />
                        Execute Tool
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="resources">
                  <div className="grid gap-2 max-h-64 overflow-y-auto">
                    {connectionResult.resources.map((resource: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{resource.uri}</h4>
                            <p className="text-sm text-muted-foreground">{resource.description}</p>
                          </div>
                          <Badge variant="outline">Resource</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="info">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto">
                    {JSON.stringify(connectionResult.server_info, null, 2)}
                  </pre>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </Form>
      </CardContent>
    </Card>
  );
};