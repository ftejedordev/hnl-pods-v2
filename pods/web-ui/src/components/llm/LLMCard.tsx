import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles,
  Edit,
  Trash2,
  TestTube,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  DollarSign,
  Zap,
  Calendar,
  Key
} from 'lucide-react';
import type { LLM, LLMProviderInfo } from '@/types/llm';
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

interface LLMCardProps {
  llm: LLM;
  providerInfo?: LLMProviderInfo;
  isTesting: boolean;
  onEdit: (llm: LLM) => void;
  onDelete: (llm: LLM) => void;
  onTest: (llm: LLM) => void;
  onToggleDefault: (llm: LLM, isDefault: boolean) => void;
}

export function LLMCard({
  llm,
  providerInfo,
  isTesting,
  onEdit,
  onDelete,
  onTest,
  onToggleDefault,
}: LLMCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleDelete = () => {
    onDelete(llm);
    setShowDeleteDialog(false);
  };

  const handleToggleDefault = (checked: boolean) => {
    onToggleDefault(llm, checked);
  };

  // Get provider color
  const getProviderColor = () => {
    const colors: Record<string, string> = {
      openai: '#10A37F',
      anthropic: '#D4A574',
      openrouter: '#8B5CF6',
      google: '#4285F4',
      custom: '#6B7280',
    };
    return colors[llm.provider] || colors.custom;
  };

  // Get status color
  const getStatusColor = () => {
    if (llm.status === 'error') return 'from-red-500/10 to-rose-600/5';
    if (llm.status === 'active') return 'from-green-500/10 to-emerald-600/5';
    if (llm.status === 'testing') return 'from-blue-500/10 to-blue-600/5';
    return 'from-gray-500/10 to-gray-600/5';
  };

  // Get status icon
  const getStatusIcon = () => {
    if (llm.status === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
    if (llm.status === 'active') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (llm.status === 'testing') return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    return null;
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
              {/* Provider Icon with status indicator */}
              <div className="relative">
                <div
                  className="h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-300 border-2"
                  style={{
                    backgroundColor: `${getProviderColor()}20`,
                    borderColor: `${getProviderColor()}50`,
                  }}
                >
                  <Key className="h-6 w-6" style={{ color: getProviderColor() }} />
                </div>
                {/* Status indicator dot */}
                <div className={`absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-card ${
                  llm.status === 'active'
                    ? 'bg-green-500 animate-pulse'
                    : llm.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                    {llm.name}
                  </h3>
                  {llm.is_default && (
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  {getStatusIcon()}
                  <span>{providerInfo?.name || llm.provider}</span>
                  <span>•</span>
                  <span className="truncate">{llm.config.model_name}</span>
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
                <DropdownMenuItem onClick={() => onEdit(llm)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTest(llm)}>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Conexión
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

          {/* Description */}
          {llm.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {llm.description}
            </p>
          )}

          {/* API Key Display */}
          <div className="rounded-lg bg-background/50 border border-border/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">API Key</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            </div>
            <p className="text-xs font-mono text-foreground truncate">
              {showApiKey ? '••••••••••••••••••••••••••••••••' : '••••••••••••••••'}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* Requests */}
            <div className="flex items-center space-x-2 rounded-lg bg-blue-500/5 border border-blue-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Zap className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="text-sm font-bold truncate">
                  {llm.usage_stats.requests_this_month || 0}
                </p>
              </div>
            </div>

            {/* Cost */}
            <div className="flex items-center space-x-2 rounded-lg bg-green-500/5 border border-green-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="h-4 w-4 text-green-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Costo</p>
                <p className="text-sm font-bold truncate">
                  ${(llm.usage_stats.cost_this_month || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Total Requests */}
            <div className="flex items-center space-x-2 rounded-lg bg-purple-500/5 border border-purple-500/10 p-2">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-bold truncate">
                  {llm.usage_stats.total_requests || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Last Used */}
          {llm.usage_stats.last_used && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-border/30">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium">Último uso</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(llm.usage_stats.last_used).toLocaleDateString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
          )}

          {/* Error Message */}
          {llm.test_error && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5">
              <div className="flex items-center space-x-2 mb-1">
                <XCircle className="h-3 w-3 text-red-500" />
                <span className="text-xs font-medium text-red-600">Error de conexión</span>
              </div>
              <p className="text-xs text-red-600/80 line-clamp-2">{llm.test_error}</p>
            </div>
          )}

          {/* Status Bar with Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center space-x-2">
              {llm.status === 'active' ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    Activo
                  </span>
                </>
              ) : llm.status === 'error' ? (
                <>
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-medium text-red-600 dark:text-red-400">
                    Error
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Inactivo
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground">Default</span>
              <Switch
                checked={llm.is_default}
                onCheckedChange={handleToggleDefault}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button
              onClick={() => onTest(llm)}
              className="flex-1 group/btn"
              variant="outline"
              disabled={isTesting}
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2 transition-transform group-hover/btn:scale-110" />
              )}
              Test
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(llm)}
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
            <AlertDialogTitle>¿Eliminar LLM?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar el LLM "<strong>{llm.name}</strong>"?
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
