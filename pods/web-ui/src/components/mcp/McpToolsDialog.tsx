import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import type { McpServerConnection, MCPToolsListResponse } from '@/types/mcp';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';
import { McpToolsList } from './McpToolsList';

interface McpToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: McpServerConnection | null;
}

export const McpToolsDialog: React.FC<McpToolsDialogProps> = ({
  open,
  onOpenChange,
  connection
}) => {
  const { toast } = useToast();
  const [toolsData, setToolsData] = useState<MCPToolsListResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTools = async (forceRefresh: boolean = false) => {
    if (!connection) return;

    setLoading(true);
    try {
      const data = await mcpServerConnectionsApi.getTools(connection.id, forceRefresh);
      setToolsData(data);
    } catch (error: any) {
      toast({
        title: "Failed to fetch tools",
        description: error.response?.data?.detail || "Could not retrieve tools from MCP server",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && connection) {
      // ✅ Always force refresh on initial load to ensure fresh data after updates/deletes
      fetchTools(true);
    }
  }, [open, connection]);

  const handleRefresh = () => {
    fetchTools(true);
  };

  if (!connection) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>MCP Tools: {connection.name}</DialogTitle>
          <DialogDescription>
            Available tools from {connection.base_url}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Discovering tools...</span>
            </div>
          ) : toolsData ? (
            <McpToolsList
              connectionId={connection.id}
              connectionName={connection.name}
              tools={toolsData.tools}
              onRefresh={handleRefresh}
              isLoading={loading}
            />
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No tools data available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};