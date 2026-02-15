import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Play,
  Edit,
  Trash2,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  MoreVertical,
  GitBranch,
  Zap
} from 'lucide-react';
import type { Flow, FlowExecution } from '@/types/flow';
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

interface FlowCardProps {
  flow: Flow;
  executions: FlowExecution[];
  onRun: (flow: Flow) => void;
  onEdit: (flow: Flow) => void;
  onDelete: (flow: Flow) => void;
}

export function FlowCard({ flow, executions, onRun, onEdit, onDelete }: FlowCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Calculate stats
  const completed = executions.filter(exec => exec.status === 'completed').length;
  const failed = executions.filter(exec => exec.status === 'failed').length;
  const total = executions.length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Get last execution
  const lastExecution = executions.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];

  // Get time ago for last execution
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const handleDelete = () => {
    onDelete(flow);
    setShowDeleteDialog(false);
  };

  // Determine card status color
  const getStatusColor = () => {
    if (!flow.is_active) return 'from-gray-500/10 to-gray-600/5';
    if (successRate >= 80) return 'from-green-500/10 to-emerald-600/5';
    if (successRate >= 50) return 'from-yellow-500/10 to-orange-600/5';
    return 'from-red-500/10 to-rose-600/5';
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
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                  {flow.name}
                </h3>
                {!flow.is_active && (
                  <Badge variant="outline" className="text-xs border-gray-400 text-gray-600">
                    <Pause className="h-3 w-3 mr-1" />
                    Pausado
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {flow.description || 'Sin descripción'}
              </p>
            </div>

            {/* Actions Menu - Always visible */}
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
                <DropdownMenuItem onClick={() => onEdit(flow)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
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

          {/* Mini Flow Graph Preview */}
          <div className="relative h-24 rounded-lg bg-background/50 border border-border/50 p-3 overflow-hidden">
            <div className="flex items-center justify-center space-x-2 h-full">
              {flow.steps.slice(0, 5).map((step, index) => (
                <div key={step.id} className="flex items-center">
                  {/* Node */}
                  <div
                    className="relative group/node"
                    title={step.name}
                  >
                    <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-primary/20">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    </div>
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover/node:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-border">
                      {step.name}
                    </div>
                  </div>

                  {/* Connector */}
                  {index < Math.min(flow.steps.length, 5) - 1 && (
                    <div className="h-px w-3 bg-primary/30" />
                  )}
                </div>
              ))}

              {/* Show "+N more" if there are more steps */}
              {flow.steps.length > 5 && (
                <div className="text-xs text-muted-foreground font-medium">
                  +{flow.steps.length - 5}
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Steps Count */}
            <div className="flex items-center space-x-2 rounded-lg bg-blue-500/5 border border-blue-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <GitBranch className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Steps</p>
                <p className="text-sm font-bold">{flow.steps.length}</p>
              </div>
            </div>

            {/* Success Rate */}
            <div className="flex items-center space-x-2 rounded-lg bg-green-500/5 border border-green-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Éxito</p>
                <p className="text-sm font-bold">{successRate}%</p>
              </div>
            </div>

            {/* Total Executions */}
            <div className="flex items-center space-x-2 rounded-lg bg-purple-500/5 border border-purple-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Zap className="h-4 w-4 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Runs</p>
                <p className="text-sm font-bold">{total}</p>
              </div>
            </div>
          </div>

          {/* Last Execution Status */}
          {lastExecution && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/30">
              <div className="flex items-center space-x-2">
                {lastExecution.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : lastExecution.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />
                )}
                <span className="text-xs font-medium">
                  {lastExecution.status === 'completed' ? 'Última ejecución exitosa' :
                   lastExecution.status === 'failed' ? 'Última ejecución falló' :
                   'Ejecutando...'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {getTimeAgo(lastExecution.created_at)}
              </span>
            </div>
          )}

          {/* Execution count badges - Moved to bottom left */}
          {total > 0 && (
            <div className="flex items-center space-x-1">
              {completed > 0 && (
                <Badge variant="outline" className="text-xs border-green-500/30 text-green-600 bg-green-500/10">
                  {completed} ✓
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-600 bg-red-500/10">
                  {failed} ✗
                </Badge>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button
              onClick={() => onRun(flow)}
              className="flex-1 group/btn"
              disabled={!flow.is_active}
            >
              <Play className="h-4 w-4 mr-2 transition-transform group-hover/btn:scale-110" />
              Ejecutar
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(flow)}
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
            <AlertDialogTitle>¿Eliminar Flow?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar el flow "<strong>{flow.name}</strong>"?
              Esta acción eliminará el flow y todas sus ejecuciones. Esta acción no se puede deshacer.
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
