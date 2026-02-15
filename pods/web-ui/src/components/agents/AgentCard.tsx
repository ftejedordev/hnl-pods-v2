import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Edit, Trash2, Sparkles, Zap, Link2, Calendar, ExternalLink } from 'lucide-react';
import type { Agent } from '@/types/agent';
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

interface AgentCardProps {
  agent: Agent;
  llmName: string;
  onEdit: (agent: Agent) => void;
  onDelete: (agentId: string) => void;
}

export function AgentCard({ agent, llmName, onEdit, onDelete }: AgentCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDelete = () => {
    onDelete(agent.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div
        className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card via-card to-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Animated border gradient */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />

        <div className="relative p-6 space-y-4">
          {/* Header with Avatar and Actions */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {/* Avatar with glow effect */}
              <div className="relative">
                {agent.avatar_url ? (
                  <div className="relative">
                    <img
                      src={agent.avatar_url}
                      alt={`${agent.name} avatar`}
                      className="h-16 w-16 rounded-2xl object-contain bg-background/50 p-1 ring-2 ring-border/50 transition-[ring] duration-300 group-hover:ring-4 group-hover:ring-primary/50"
                      style={{ borderColor: agent.color || '#3B82F6', mixBlendMode: 'multiply' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    {/* Glow behind avatar */}
                    <div
                      className="absolute inset-0 rounded-2xl blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-50"
                      style={{ backgroundColor: agent.color || '#3B82F6' }}
                    />
                  </div>
                ) : (
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center ring-2 ring-border/50 transition-all duration-300 group-hover:ring-4 group-hover:ring-primary/50 group-hover:scale-110 relative"
                    style={{ backgroundColor: agent.color || '#3B82F6' }}
                  >
                    <Bot className="h-8 w-8 text-white" />
                    {/* Glow behind avatar */}
                    <div
                      className="absolute inset-0 rounded-2xl blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-50"
                      style={{ backgroundColor: agent.color || '#3B82F6' }}
                    />
                  </div>
                )}
                {/* Status indicator */}
                {agent.llm_id && (
                  <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 ring-2 ring-card animate-pulse" />
                )}
              </div>

              {/* Name and Role */}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                  {agent.name}
                </h3>
                {agent.role && (
                  <Badge
                    variant="outline"
                    className="mt-1 text-xs border-primary/30 text-primary/80"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    {agent.role}
                  </Badge>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className={`flex space-x-1 transition-all duration-300 ${isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}`}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                onClick={() => onEdit(agent)}
                title="Editar agente"
              >
                <Edit className="h-4 w-4" />
              </Button>
              {!agent.is_default && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  title="Eliminar agente"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {agent.description || 'Sin descripción'}
          </p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* LLM Info */}
            <div className="flex items-center space-x-2 rounded-lg bg-primary/5 p-2.5 border border-primary/10">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">LLM</p>
                <p className="text-xs font-medium truncate">{llmName}</p>
              </div>
            </div>

            {/* MCP Connections */}
            <div className="flex items-center space-x-2 rounded-lg bg-purple-500/5 p-2.5 border border-purple-500/10">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Link2 className="h-4 w-4 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">MCPs</p>
                <p className="text-xs font-medium">
                  {agent.mcp_connections?.length || 0} {agent.mcp_connections?.length === 1 ? 'conexión' : 'conexiones'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{new Date(agent.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>

            <Badge
              variant={agent.is_default ? "default" : "secondary"}
              className="text-xs"
            >
              {agent.is_default ? (
                <>
                  <Zap className="h-3 w-3 mr-1" />
                  Sistema
                </>
              ) : (
                'Personalizado'
              )}
            </Badge>
          </div>

          {/* View Details Button (appears on hover) */}
          <Button
            variant="outline"
            className={`w-full transition-all duration-300 ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'} group/btn hover:bg-primary hover:text-primary-foreground hover:border-primary`}
            onClick={() => onEdit(agent)}
          >
            Ver detalles
            <ExternalLink className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar agente?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar el agente "<strong>{agent.name}</strong>"?
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
