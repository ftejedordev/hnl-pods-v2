import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Plus, RefreshCw, Server, Link2 } from 'lucide-react';
import type { McpServerConnection } from '@/types/mcp';
import { McpServerConnectionTable } from '@/components/mcp/McpServerConnectionTable';
import { McpServerConnectionFormDialog } from '@/components/mcp/McpServerConnectionFormDialog';
import { McpToolsDialog } from '@/components/mcp/McpToolsDialog';
import { useMcpConnections } from '@/hooks/useMcpConnections';
import { useQueryClient } from '@tanstack/react-query';

export const McpManagementPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading: loading, isFetching: refreshing } = useMcpConnections();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<McpServerConnection | undefined>();
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const [viewingToolsConnection, setViewingToolsConnection] = useState<McpServerConnection | undefined>();

  const handleAddConnection = () => {
    setEditingConnection(undefined);
    setDialogOpen(true);
  };

  const handleEditConnection = (connection: McpServerConnection) => {
    setEditingConnection(connection);
    setDialogOpen(true);
  };

  const handleDeleteConnection = (_connectionId: string) => {
    queryClient.invalidateQueries({ queryKey: ['mcp-connections'] });
  };

  const handleViewTools = (connection: McpServerConnection) => {
    setViewingToolsConnection(connection);
    setToolsDialogOpen(true);
  };

  const handleDialogSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['mcp-connections'] });
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mcp-connections'] });
    toast({
      title: "Connections refreshed",
      description: `Found ${connections.length} connection${connections.length !== 1 ? 's' : ''}`,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading MCP connections...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/10 to-primary/5 border border-primary/20 p-8">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:radial-gradient(white,transparent_85%)]" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center backdrop-blur-sm">
                <Link2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">MCP Servers</h2>
                <p className="text-muted-foreground">
                  Gestiona conexiones Model Context Protocol
                </p>
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handleRefresh}
              disabled={refreshing}
              className="shadow-lg"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button onClick={handleAddConnection} size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Conexión
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Conexiones</p>
                <p className="text-2xl font-bold">{connections.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Activas</p>
                <p className="text-2xl font-bold">
                  {connections.filter(conn => conn.is_active).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-gray-500/10 flex items-center justify-center">
                <Server className="h-6 w-6 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inactivas</p>
                <p className="text-2xl font-bold">
                  {connections.filter(conn => !conn.is_active).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Actividad 24h</p>
                <p className="text-2xl font-bold">
                  {connections.filter(conn => {
                    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return new Date(conn.updated_at) > dayAgo;
                  }).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>MCP Server Connections</CardTitle>
          <CardDescription>
            Configure and manage connections to MCP servers. These connections allow your HypernovaLabs Pods to interact with various MCP-compatible services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <McpServerConnectionTable
            connections={connections}
            onEdit={handleEditConnection}
            onDelete={handleDeleteConnection}
            onViewTools={handleViewTools}
          />
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <McpServerConnectionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={editingConnection}
        onSuccess={handleDialogSuccess}
      />

      {/* Tools Dialog */}
      <McpToolsDialog
        open={toolsDialogOpen}
        onOpenChange={setToolsDialogOpen}
        connection={viewingToolsConnection || null}
      />
    </div>
  );
};
