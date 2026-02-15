import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Wrench,
  AlertCircle,
  FolderEdit,
  Key
} from 'lucide-react';
import type { McpServerConnection } from '@/types/mcp';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';

interface McpServerConnectionTableProps {
  connections: McpServerConnection[];
  onEdit: (connection: McpServerConnection) => void;
  onDelete: (connectionId: string) => void;
  onViewTools: (connection: McpServerConnection) => void;
}

export const McpServerConnectionTable: React.FC<McpServerConnectionTableProps> = ({
  connections,
  onEdit,
  onDelete,
  onViewTools
}) => {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<McpServerConnection | null>(null);

  const handleDeleteClick = (connection: McpServerConnection) => {
    console.log("🔥 handleDeleteClick called with:", connection.name);

    // Extra protection for default connections
    if (connection.is_default) {
      console.log("🔥 Connection is default, blocking delete");
      toast({
        title: "Cannot delete",
        description: "Default system connections cannot be deleted",
        variant: "destructive",
      });
      return;
    }

    console.log("🔥 Opening delete confirmation dialog...");
    setConnectionToDelete(connection);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!connectionToDelete) return;

    console.log(`🗑️ UI: Attempting to delete connection ${connectionToDelete.id} (${connectionToDelete.name})`);
    try {
      const result = await mcpServerConnectionsApi.delete(connectionToDelete.id);
      console.log(`🗑️ UI: Delete API call successful`, result);

      // Call parent's onDelete to refresh the list
      onDelete(connectionToDelete.id);

      toast({
        title: "Connection deleted",
        description: `${connectionToDelete.name} has been deleted successfully`,
      });
      console.log(`🗑️ UI: Delete completed successfully`);
    } catch (error: any) {
      console.error(`🗑️ UI: Delete failed`, error);
      console.error(`🗑️ UI: Error response:`, error?.response);

      const errorMessage = error?.response?.data?.detail || error?.message || "Failed to delete the MCP server connection";
      const errorStatus = error?.response?.status;

      toast({
        title: "Delete failed",
        description: `${errorMessage} (Status: ${errorStatus || 'Unknown'})`,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setConnectionToDelete(null);
    }
  };

  const getConnectionUrl = (connection: McpServerConnection) => {
    switch (connection.transport_type) {
      case 'sse':
        return connection.sse_url || 'No SSE URL configured';
      case 'stdio':
        const command = connection.stdio_command || 'No command configured';
        const args = connection.stdio_args?.length ? ` ${connection.stdio_args.join(' ')}` : '';
        return `${command}${args}`;
      case 'internal':
        // Special handling for SonarQube internal connections
        if (connection.name?.toLowerCase().includes('sonarqube')) {
          return connection.base_url || 'Missing config - Set SONARQUBE_BASE_URL';
        }
        return connection.base_url || 'Internal MCP Server';
      case 'http':
      default:
        return connection.base_url || 'No URL configured';
    }
  };

  const getTransportBadge = (transportType: string) => {
    const variants = {
      'http': { variant: 'default' as const, label: 'HTTP' },
      'sse': { variant: 'secondary' as const, label: 'SSE' },
      'stdio': { variant: 'outline' as const, label: 'STDIO' },
      'internal': { variant: 'destructive' as const, label: 'INTERNAL' }
    };
    
    const config = variants[transportType as keyof typeof variants] || variants.http;
    
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  const getStatusIcon = (isActive: boolean) => {
    if (!isActive) {
      return <Badge variant="secondary" className="flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Inactive
      </Badge>;
    }

    return <Badge variant="outline" className="flex items-center gap-1">
      <AlertCircle className="h-3 w-3" />
      Active
    </Badge>;
  };

  // DEBUG: Log connections on render
  console.log("🔍 Rendering connections:", connections.length);
  connections.forEach(conn => {
    console.log(`  - ${conn.name}: is_default=${conn.is_default}, id=${conn.id}`);
  });

  if (connections.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No MCP server connections configured.</p>
        <p className="text-sm mt-2">Add your first connection to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Transport</TableHead>
            <TableHead>Connection Details</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {connections.map((connection) => (
            <TableRow key={connection.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {connection.name}
                  {connection.is_default && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      DEFAULT
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {getTransportBadge(connection.transport_type)}
              </TableCell>
              <TableCell className="max-w-sm">
                <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm break-all">
                  {getConnectionUrl(connection)}
                </code>
              </TableCell>
              <TableCell>
                {getStatusIcon(connection.is_active)}
              </TableCell>
              <TableCell className="max-w-xs truncate">
                {connection.description || <span className="text-muted-foreground">No description</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDistanceToNow(new Date(connection.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {/* Special button for Filesystem MCP to edit path */}
                  {connection.name === "Filesystem MCP" && connection.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(connection)}
                      className="h-8 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <FolderEdit className="h-3.5 w-3.5" />
                      Editar Ruta
                    </Button>
                  )}

                  {/* Special button for MuleSoft MCP to edit credentials */}
                  {connection.name === "MuleSoft MCP Server" && connection.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(connection)}
                      className="h-8 gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                    >
                      <Key className="h-3.5 w-3.5" />
                      Configurar Credenciales
                    </Button>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewTools(connection)}>
                        <Wrench className="mr-2 h-4 w-4" />
                        View Tools
                      </DropdownMenuItem>
                      {!connection.is_default && (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(connection)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              console.log("🔥 CLICK DETECTADO EN DELETE!");
                              console.log("🔥 Connection:", connection);
                              handleDeleteClick(connection);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar "{connectionToDelete?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              console.log("🔥 User cancelled deletion");
              setConnectionToDelete(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};