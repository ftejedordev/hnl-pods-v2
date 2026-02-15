import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus, X, FolderOpen } from 'lucide-react';
import type { McpServerConnection, McpServerConnectionCreate, McpServerConnectionUpdate, UserMcpTransportType } from '@/types/mcp';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  transport_type: z.enum(['http', 'stdio', 'sse']),
  base_url: z.string().optional(),
  api_key: z.string().optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  is_active: z.boolean().default(true),
  stdio_command: z.string().optional(),
  stdio_args: z.array(z.string()).optional(),
  sse_url: z.string().optional(),
  sse_headers: z.record(z.string()).optional(),
}).refine((data) => {
  if (data.transport_type === 'http') {
    return data.base_url && data.base_url.length > 0 && 
           (data.base_url.startsWith('http://') || data.base_url.startsWith('https://'));
  }
  if (data.transport_type === 'stdio') {
    return data.stdio_command && data.stdio_command.length > 0;
  }
  if (data.transport_type === 'sse') {
    return data.sse_url && data.sse_url.length > 0 &&
           (data.sse_url.startsWith('http://') || data.sse_url.startsWith('https://'));
  }
  return true;
}, {
  message: 'Please provide the required fields for the selected transport type',
  path: ['transport_type']
});

type FormData = z.infer<typeof formSchema>;

interface McpServerConnectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection?: McpServerConnection;
  onSuccess: () => void;
}

export const McpServerConnectionFormDialog: React.FC<McpServerConnectionFormDialogProps> = ({
  open,
  onOpenChange,
  connection,
  onSuccess
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stdioArgs, setStdioArgs] = useState<string[]>([]);
  const [sseHeaders, setSseHeaders] = useState<Array<{key: string, value: string}>>([]);
  const [filesystemPath, setFilesystemPath] = useState<string>('');
  const [mulesoftClientId, setMulesoftClientId] = useState<string>('');
  const [mulesoftClientSecret, setMulesoftClientSecret] = useState<string>('');
  const [mulesoftRegion, setMulesoftRegion] = useState<string>('PROD_US');
  const [mulesoftIsActive, setMulesoftIsActive] = useState<boolean>(false);
  const isEditing = Boolean(connection);
  const isSystemConnection = connection?.is_default && connection?.user_id === 'system';

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      transport_type: 'http',
      base_url: '',
      api_key: '',
      description: '',
      is_active: true,
      stdio_command: '',
      stdio_args: [],
      sse_url: '',
      sse_headers: {},
    },
  });

  const watchTransportType = form.watch('transport_type');
  const watchStdioCommand = form.watch('stdio_command');

  // Check if this is a filesystem MCP server
  const isFilesystemMcp = watchTransportType === 'stdio' &&
    (watchStdioCommand === 'npx' || watchStdioCommand === 'uvx') &&
    (stdioArgs.some(arg => arg.includes('filesystem')) ||
     stdioArgs.some(arg => arg.includes('@modelcontextprotocol/server-filesystem')));

  // Check if this is MuleSoft MCP server
  const isMulesoftMcp = connection?.name === 'MuleSoft MCP Server' && isSystemConnection;

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      const selectedPath = await dialog.open({
        directory: true,
        multiple: false,
        title: 'Select Filesystem Root Directory'
      });

      if (selectedPath) {
        setFilesystemPath(selectedPath as string);

        // Update the last argument (the path) in stdioArgs
        const newArgs = [...stdioArgs];
        if (newArgs.length > 0) {
          // Replace the last argument (which should be the path)
          newArgs[newArgs.length - 1] = selectedPath as string;
        } else {
          // If no args yet, create the default structure for filesystem
          newArgs.push('-y', '@modelcontextprotocol/server-filesystem', selectedPath as string);
        }
        setStdioArgs(newArgs);
        form.setValue('stdio_args', newArgs);
      }
    } catch (error: any) {
      console.error('Failed to open folder dialog:', error);

      // Check if it's a "not available" error (browser mode)
      if (error?.message?.includes('not available') || error?.message?.includes('__TAURI_INTERNALS__')) {
        toast({
          title: "Browser mode detected",
          description: "Please enter the path manually. File picker only works in Tauri app.",
          variant: "default"
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to open folder selection dialog: ${error?.message || error}`,
          variant: "destructive"
        });
      }
    }
  };

  // Reset form when dialog opens/closes or connection changes
  useEffect(() => {
    if (open) {
      if (connection) {
        const resetData = {
          name: connection.name,
          transport_type: connection.transport_type === 'internal' ? 'http' : connection.transport_type as UserMcpTransportType,
          base_url: connection.base_url || '',
          api_key: connection.api_key || '',
          description: connection.description || '',
          is_active: connection.is_active,
          stdio_command: connection.stdio_command || '',
          stdio_args: connection.stdio_args || [],
          sse_url: connection.sse_url || '',
          sse_headers: connection.sse_headers || {},
        };
        form.reset(resetData);
        setStdioArgs(connection.stdio_args || []);

        // Extract filesystem path if it exists (last argument for filesystem MCP)
        if (connection.stdio_args && connection.stdio_args.length > 0) {
          const lastArg = connection.stdio_args[connection.stdio_args.length - 1];
          if (lastArg.startsWith('/') || lastArg.includes(':\\')) {
            setFilesystemPath(lastArg);
          }
        }

        // Extract MuleSoft credentials if this is MuleSoft MCP
        if (connection.name === 'MuleSoft MCP Server' && connection.env_vars) {
          setMulesoftClientId(connection.env_vars.ANYPOINT_CLIENT_ID || '');
          setMulesoftClientSecret(connection.env_vars.ANYPOINT_CLIENT_SECRET || '');
          setMulesoftRegion(connection.env_vars.ANYPOINT_REGION || 'PROD_US');
          setMulesoftIsActive(connection.is_active);
        }

        // Convert sse_headers object to array format for editing
        const headersArray = connection.sse_headers ?
          Object.entries(connection.sse_headers).map(([key, value]) => ({key, value})) : [];
        setSseHeaders(headersArray);
      } else {
        form.reset({
          name: '',
          transport_type: 'http',
          base_url: '',
          api_key: '',
          description: '',
          is_active: true,
          stdio_command: '',
          stdio_args: [],
          sse_url: '',
          sse_headers: {},
        });
        setStdioArgs([]);
        setSseHeaders([]);
      }
    }
  }, [open, connection, form]);

  const onSubmit = async (data: FormData) => {
    console.log('🔍 onSubmit called', {
      isEditing,
      isSystemConnection,
      isMulesoftMcp,
      isFilesystemMcp,
      connectionId: connection?.id,
      stdioArgs,
      filesystemPath
    });

    setIsSubmitting(true);
    try {
      // For MuleSoft MCP system connection, send env_vars and is_active
      if (isEditing && isMulesoftMcp) {
        // Auto-activate if credentials are provided
        const hasCredentials = mulesoftClientId.trim() !== '' && mulesoftClientSecret.trim() !== '';
        const updateData: McpServerConnectionUpdate = {
          env_vars: {
            ANYPOINT_CLIENT_ID: mulesoftClientId,
            ANYPOINT_CLIENT_SECRET: mulesoftClientSecret,
            ANYPOINT_REGION: mulesoftRegion
          },
          is_active: hasCredentials ? true : mulesoftIsActive
        };
        await mcpServerConnectionsApi.update(connection.id, updateData);
        toast({
          title: "MuleSoft MCP updated",
          description: hasCredentials
            ? "Anypoint Platform credentials saved and MCP activated"
            : "MuleSoft MCP configuration updated",
        });
        onSuccess();
        onOpenChange(false);
        setIsSubmitting(false);
        return;
      }

      // For Filesystem system connections, only send stdio_args
      if (isEditing && isSystemConnection) {
        const updateData: McpServerConnectionUpdate = {
          stdio_args: stdioArgs,
        };
        console.log('🚀 Calling mcpServerConnectionsApi.update for system connection', {
          connectionId: connection.id,
          updateData
        });

        try {
          const result = await mcpServerConnectionsApi.update(connection.id, updateData);
          console.log('✅ Update successful:', result);

          toast({
            title: "System connection updated",
            description: "Filesystem path has been updated successfully",
          });
          onSuccess();
          onOpenChange(false);
          setIsSubmitting(false);
          return;
        } catch (error: any) {
          console.error('❌ Update failed:', error);
          console.error('Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          });
          throw error; // Re-throw to be caught by outer try-catch
        }
      }

      // Regular flow for user connections
      const baseData = {
        name: data.name,
        transport_type: data.transport_type,
        description: data.description || undefined,
        is_active: data.is_active,
      };

      const transportSpecificData = (() => {
        switch (data.transport_type) {
          case 'http':
            return {
              base_url: data.base_url || '',
              api_key: data.api_key || undefined,
            };
          case 'stdio':
            return {
              base_url: '', // Keep for compatibility
              stdio_command: data.stdio_command || '',
              stdio_args: stdioArgs,
            };
          case 'sse':
            return {
              base_url: '', // Keep for compatibility
              sse_url: data.sse_url || '',
              sse_headers: data.sse_headers || {},
            };
          default:
            return { base_url: data.base_url || '' };
        }
      })();

      if (isEditing && connection) {
        // Update existing connection
        const updateData: McpServerConnectionUpdate = {
          ...baseData,
          ...transportSpecificData,
        };
        await mcpServerConnectionsApi.update(connection.id, updateData);
        toast({
          title: "Connection updated",
          description: `${data.name} has been updated successfully`,
        });
      } else {
        // Create new connection
        const createData: McpServerConnectionCreate = {
          ...baseData,
          ...transportSpecificData,
        };
        await mcpServerConnectionsApi.create(createData);
        toast({
          title: "Connection created",
          description: `${data.name} has been created successfully`,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'An unexpected error occurred';
      toast({
        title: isEditing ? "Update failed" : "Creation failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  const addStdioArg = () => {
    setStdioArgs([...stdioArgs, '']);
  };

  const updateStdioArg = (index: number, value: string) => {
    const newArgs = [...stdioArgs];
    newArgs[index] = value;
    setStdioArgs(newArgs);
    form.setValue('stdio_args', newArgs);
  };

  const removeStdioArg = (index: number) => {
    const newArgs = stdioArgs.filter((_, i) => i !== index);
    setStdioArgs(newArgs);
    form.setValue('stdio_args', newArgs);
  };

  const addSseHeader = () => {
    setSseHeaders([...sseHeaders, { key: '', value: '' }]);
  };

  const updateSseHeader = (index: number, field: 'key' | 'value', value: string) => {
    const newHeaders = [...sseHeaders];
    newHeaders[index][field] = value;
    setSseHeaders(newHeaders);
    
    // Convert to object format for form
    const headersObject = newHeaders.reduce((acc, {key, value}) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    form.setValue('sse_headers', headersObject);
  };

  const removeSseHeader = (index: number) => {
    const newHeaders = sseHeaders.filter((_, i) => i !== index);
    setSseHeaders(newHeaders);
    
    // Convert to object format for form
    const headersObject = newHeaders.reduce((acc, {key, value}) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    form.setValue('sse_headers', headersObject);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isSystemConnection
              ? 'Edit System MCP Connection Path'
              : isEditing
                ? 'Edit MCP Server Connection'
                : 'Add New MCP Server Connection'}
          </DialogTitle>
          <DialogDescription>
            {isSystemConnection
              ? 'You can only modify the filesystem path for system default MCP connections.'
              : isEditing
                ? 'Update the configuration for this MCP server connection.'
                : 'Configure a new MCP server connection. You can connect to local or remote MCP servers.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isSystemConnection ? (
              /* System Connection: Show different UI for Filesystem vs MuleSoft */
              isMulesoftMcp ? (
                /* MuleSoft MCP: Show credentials editor */
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-4">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-200 mb-2">
                      MuleSoft Anypoint Platform
                    </p>
                    <p className="text-xs text-purple-700 dark:text-purple-300">
                      Configure your Anypoint Platform credentials to enable MuleSoft MCP tools.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <FormLabel>Client ID</FormLabel>
                      <Input
                        value={mulesoftClientId}
                        onChange={(e) => setMulesoftClientId(e.target.value)}
                        placeholder="Enter your Anypoint Client ID"
                        type="text"
                      />
                      <FormDescription className="text-xs">
                        Your Anypoint Platform Connected App Client ID
                      </FormDescription>
                    </div>

                    <div className="space-y-2">
                      <FormLabel>Client Secret</FormLabel>
                      <Input
                        value={mulesoftClientSecret}
                        onChange={(e) => setMulesoftClientSecret(e.target.value)}
                        placeholder="Enter your Anypoint Client Secret"
                        type="password"
                      />
                      <FormDescription className="text-xs">
                        Your Anypoint Platform Connected App Client Secret
                      </FormDescription>
                    </div>

                    <div className="space-y-2">
                      <FormLabel>Region</FormLabel>
                      <Select value={mulesoftRegion} onValueChange={setMulesoftRegion}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PROD_US">United States (PROD_US)</SelectItem>
                          <SelectItem value="PROD_EU">Europe (PROD_EU)</SelectItem>
                          <SelectItem value="PROD_CA">Canada (PROD_CA)</SelectItem>
                          <SelectItem value="PROD_JP">Japan (PROD_JP)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Your Anypoint Platform region
                      </FormDescription>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                      <Switch
                        checked={mulesoftIsActive}
                        onCheckedChange={setMulesoftIsActive}
                        id="mulesoft-active"
                      />
                      <FormLabel htmlFor="mulesoft-active" className="cursor-pointer">
                        Enable MuleSoft MCP Server
                      </FormLabel>
                    </div>
                    <FormDescription className="text-xs pl-0">
                      Toggle to activate or deactivate the MuleSoft MCP connection
                    </FormDescription>
                  </div>
                </div>
              ) : (
                /* Filesystem MCP: Show filesystem path editor */
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                      System MCP Connection
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      This is a system default MCP connection. You can only modify the filesystem path.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <FormLabel>Filesystem Root Directory</FormLabel>
                    <div className="flex gap-2">
                      <Input
                        value={filesystemPath}
                        onChange={(e) => {
                          setFilesystemPath(e.target.value);
                          const newArgs = [...stdioArgs];
                          if (newArgs.length > 0) {
                            newArgs[newArgs.length - 1] = e.target.value;
                            setStdioArgs(newArgs);
                            form.setValue('stdio_args', newArgs);
                          }
                        }}
                        placeholder="/Users/username/projects or C:\Projects"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSelectFolder}
                        className="flex-shrink-0"
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Browse
                      </Button>
                    </div>
                    <FormDescription className="text-xs">
                      The root directory that the filesystem MCP server can access. Click Browse to select a folder.
                    </FormDescription>
                  </div>
                </div>
              )
            ) : (
              /* User Connection: Show all fields */
              <div className="grid grid-cols-1 gap-3">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My MCP Server" {...field} />
                      </FormControl>
                      <FormDescription>
                        A descriptive name for this connection
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          <SelectItem value="http">HTTP/HTTPS</SelectItem>
                          <SelectItem value="stdio">Standard I/O (stdio)</SelectItem>
                          <SelectItem value="sse">Server-Sent Events (SSE)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose how to connect to the MCP server
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              {/* HTTP Transport Fields */}
              {watchTransportType === 'http' && (
                <>
                  <FormField
                    control={form.control}
                    name="base_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://api.example.com or http://localhost:8001" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          The base URL of the MCP server (must include http:// or https://)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="api_key"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>API Key (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Enter API key if required" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          API key for authentication (leave empty if not required)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* Stdio Transport Fields */}
              {watchTransportType === 'stdio' && (
                <>
                  <FormField
                    control={form.control}
                    name="stdio_command"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Command</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="npx, uvx, python, node, etc."
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          The command to run the MCP server (e.g., npx, uvx, python)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Filesystem Path Selector - Only show for filesystem MCP */}
                  {isFilesystemMcp && (
                    <div className="space-y-2">
                      <FormLabel>Filesystem Root Directory</FormLabel>
                      <div className="flex gap-2">
                        <Input
                          value={filesystemPath}
                          onChange={(e) => {
                            setFilesystemPath(e.target.value);
                            // Update the last arg in stdioArgs
                            const newArgs = [...stdioArgs];
                            if (newArgs.length > 0) {
                              newArgs[newArgs.length - 1] = e.target.value;
                              setStdioArgs(newArgs);
                              form.setValue('stdio_args', newArgs);
                            }
                          }}
                          placeholder="/Users/username/projects or C:\Projects"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSelectFolder}
                          className="flex-shrink-0"
                        >
                          <FolderOpen className="h-4 w-4 mr-2" />
                          Browse
                        </Button>
                      </div>
                      <FormDescription className="text-xs">
                        The root directory that the filesystem MCP server can access. Click Browse to select a folder.
                      </FormDescription>
                    </div>
                  )}

                  <div className="space-y-2">
                    <FormLabel>Arguments {isFilesystemMcp ? '(Auto-managed for Filesystem MCP)' : '(Optional)'}</FormLabel>
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {stdioArgs.map((arg, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={arg}
                            onChange={(e) => updateStdioArg(index, e.target.value)}
                            placeholder={`Argument ${index + 1}`}
                            className="flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeStdioArg(index)}
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
                      onClick={addStdioArg}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Argument
                    </Button>
                    <FormDescription className="text-xs">
                      Command line arguments to pass to the MCP server
                    </FormDescription>
                  </div>
                </>
              )}

              {/* SSE Transport Fields */}
              {watchTransportType === 'sse' && (
                <>
                  <FormField
                    control={form.control}
                    name="sse_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SSE URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://api.example.com/sse or http://localhost:8001/events" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          The URL for Server-Sent Events connection (must include http:// or https://)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <FormLabel>Custom Headers (Optional)</FormLabel>
                    <div className="max-h-32 overflow-y-auto space-y-2">
                      {sseHeaders.map((header, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={header.key}
                            onChange={(e) => updateSseHeader(index, 'key', e.target.value)}
                            placeholder="Header name (e.g., Authorization)"
                            className="flex-1 text-sm"
                          />
                          <Input
                            value={header.value}
                            onChange={(e) => updateSseHeader(index, 'value', e.target.value)}
                            placeholder="Header value (e.g., Bearer token123)"
                            className="flex-1 text-sm"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeSseHeader(index)}
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
                      onClick={addSseHeader}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Header
                    </Button>
                    <FormDescription className="text-xs">
                      Custom headers to send with SSE connection (e.g., Authorization, API-Key)
                    </FormDescription>
                  </div>
                </>
              )}

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Optional description of this MCP server connection..."
                        className="min-h-[60px] text-sm"
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Optional description or notes about this connection
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">
                        Active Connection
                      </FormLabel>
                      <FormDescription className="text-xs">
                        Enable this connection for use
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={isSubmitting}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto order-1 sm:order-2">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSystemConnection
                  ? 'Update Path'
                  : isEditing
                    ? 'Update Connection'
                    : 'Create Connection'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};