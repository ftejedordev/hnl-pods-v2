import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Server,
  Edit,
  Trash2,
  Wrench,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Radio
} from 'lucide-react';
import type { McpServerConnection } from '@/types/mcp';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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

interface McpConnectionCardProps {
  connection: McpServerConnection;
  onEdit: (connection: McpServerConnection) => void;
  onDelete: (connection: McpServerConnection) => void;
  onToggle: (connection: McpServerConnection, isActive: boolean) => void;
  onViewTools: (connection: McpServerConnection) => void;
}

export function McpConnectionCard({
  connection,
  onEdit,
  onDelete,
  onToggle,
  onViewTools,
}: McpConnectionCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    onDelete(connection);
    setShowDeleteDialog(false);
  };

  const handleToggle = (checked: boolean) => {
    onToggle(connection, checked);
  };

  // Get transport type badge color
  const getTransportBadge = () => {
    const colors = {
      stdio: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      sse: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
      http: 'bg-green-500/10 text-green-600 border-green-500/30',
    };
    return colors[connection.transport_type as keyof typeof colors] || colors.stdio;
  };

  // Status color
  const getStatusColor = () => {
    if (!connection.is_active) return 'from-gray-500/10 to-gray-600/5';
    return 'from-green-500/10 to-emerald-600/5';
  };

  return (
    <>
      <Card
        className="group relative overflow-hidden border border-border/50 bg-gradient-to-br from-card via-card to-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
      >
        {/* Status gradient overlay */}
        <div className={`absolute inset-0 bg-gradient-to-br ${getStatusColor()} opacity-50 transition-opacity duration-300`} />

        {/* Animated border gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />

        <CardContent className="relative p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              {/* Server Icon with status indicator */}
              <div className="relative">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  connection.is_active
                    ? 'bg-green-500/10 border-2 border-green-500/30'
                    : 'bg-gray-500/10 border-2 border-gray-500/30'
                }`}>
                  <Server className={`h-6 w-6 ${
                    connection.is_active ? 'text-green-500' : 'text-gray-500'
                  }`} />
                </div>
                {/* Status indicator dot */}
                <div className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-card ${
                  connection.is_active
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-gray-400'
                }`} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                    {connection.name}
                  </h3>
                  <Badge variant="outline" className={`text-xs ${getTransportBadge()}`}>
                    {connection.transport_type.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  {connection.is_active ? (
                    <>
                      <Radio className="h-3 w-3 text-green-500" />
                      <span>Conectado</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3 text-gray-500" />
                      <span>Desconectado</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Actions Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-2 flex-shrink-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(connection)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewTools(connection)}>
                  <Wrench className="h-4 w-4 mr-2" />
                  Ver Tools
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Connection Details */}
          <div className="space-y-3">
            {/* Command/URL */}
            <div className="rounded-lg bg-background/50 border border-border/30 p-3">
              <div className="flex items-start space-x-2">
                <Activity className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {connection.transport_type === 'stdio' ? 'Command' : 'URL'}
                  </p>
                  <p className="text-xs font-mono text-foreground break-all">
                    {connection.transport_type === 'stdio'
                      ? connection.stdio_command || 'No command'
                      : connection.sse_url || 'No URL'}
                  </p>
                </div>
              </div>
            </div>

            {/* Arguments (if stdio) */}
            {connection.transport_type === 'stdio' && connection.stdio_args && connection.stdio_args.length > 0 && (
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2.5">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="h-3 w-3 text-blue-500" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    Argumentos
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {connection.stdio_args.slice(0, 3).map((arg: string, index: number) => (
                    <Badge
                      key={index}
                      variant="outline"
                      className="text-xs border-blue-500/20 text-blue-600 bg-blue-500/5 font-mono"
                    >
                      {arg}
                    </Badge>
                  ))}
                  {connection.stdio_args.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{connection.stdio_args.length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Environment Variables */}
            {connection.env_vars && Object.keys(connection.env_vars).length > 0 && (
              <div className="rounded-lg bg-purple-500/5 border border-purple-500/10 p-2.5">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="h-3 w-3 text-purple-500" />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-400">
                    Variables de Entorno
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(connection.env_vars).slice(0, 3).map((key) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="text-xs border-purple-500/20 text-purple-600 bg-purple-500/5 font-mono"
                    >
                      {key}
                    </Badge>
                  ))}
                  {Object.keys(connection.env_vars).length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{Object.keys(connection.env_vars).length - 3}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Bar with Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center space-x-2">
              {connection.is_active ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Activo
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Inactivo
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground">
                {connection.is_active ? 'Conectado' : 'Desconectado'}
              </span>
              <Switch
                checked={connection.is_active}
                onCheckedChange={handleToggle}
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button
              onClick={() => onViewTools(connection)}
              className="flex-1 group/btn"
              variant="outline"
              disabled={!connection.is_active}
            >
              <Wrench className="h-4 w-4 mr-2 transition-transform group-hover/btn:scale-110" />
              Ver Tools
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(connection)}
              className="hover:bg-primary/10 hover:text-primary hover:border-primary/50"
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Conexión MCP?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la conexión "<strong>{connection.name}</strong>"?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
