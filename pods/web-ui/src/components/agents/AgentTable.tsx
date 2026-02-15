import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Bot, Edit, Trash2 } from 'lucide-react';
import type { Agent } from '@/types/agent';
import type { LLM } from '@/types/llm';
import { llmsApi } from '@/api/llms';

interface AgentTableProps {
  agents: Agent[];
  onEdit: (agent: Agent) => void;
  onDelete: (agentId: string) => void;
  isLoading?: boolean;
}

export function AgentTable({ agents, onEdit, onDelete, isLoading }: AgentTableProps) {
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  const [llms, setLlms] = useState<LLM[]>([]);

  useEffect(() => {
    loadLlms();
  }, []);

  const loadLlms = async () => {
    try {
      const response = await llmsApi.getLLMs();
      setLlms(response.llms);
    } catch (error) {
      console.error('Error loading LLMs:', error);
      setLlms([]);
    }
  };

  const getLlmName = (llmId: string | undefined) => {
    if (!llmId) return 'Sin LLM';
    const llm = llms.find(l => l.id === llmId);
    return llm ? `${llm.name} (${llm.provider})` : 'LLM no encontrado';
  };

  const handleDelete = async (agentId: string) => {
    setDeletingAgent(agentId);
    try {
      await onDelete(agentId);
    } finally {
      setDeletingAgent(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No hay agentes</h3>
        <p className="text-muted-foreground text-center max-w-sm">
          Crea tu primer agente para comenzar a automatizar tareas y procesos.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agente</TableHead>
          <TableHead>LLM</TableHead>
          <TableHead>Conexiones MCP</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Fecha de Creación</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => (
          <TableRow key={agent.id}>
            <TableCell className="font-medium">
              <div className="flex items-center space-x-3">
                {agent.avatar_url ? (
                  <div className="relative">
                    <img 
                      src={agent.avatar_url} 
                      alt={`${agent.name} avatar`}
                      className="h-8 w-8 rounded-full object-cover ring-2 ring-border"
                      style={{ borderColor: agent.color || '#3B82F6' }}
                      onError={(e) => {
                        // Fallback to Bot icon if image fails to load
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <Bot className="h-8 w-8 text-muted-foreground hidden" />
                  </div>
                ) : (
                  <div 
                    className="h-8 w-8 rounded-full flex items-center justify-center ring-2 ring-border"
                    style={{ backgroundColor: agent.color || '#3B82F6' }}
                  >
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="font-medium truncate">{agent.name}</div>
                    {agent.role && (
                      <Badge variant="outline" className="text-xs">
                        {agent.role}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground line-clamp-1">{agent.description}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {getLlmName(agent.llm_id)}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {agent.mcp_connections && agent.mcp_connections.length > 0 
                  ? `${agent.mcp_connections.length} ${agent.mcp_connections.length === 1 ? 'conexión' : 'conexiones'}`
                  : 'Sin conexiones'
                }
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={agent.is_default ? "default" : "secondary"}>
                {agent.is_default ? 'Por defecto' : 'Personalizado'}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {new Date(agent.created_at).toLocaleDateString()}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(agent)}
                  title={agent.is_default ? "Editar configuración del agente" : "Editar agente"}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                {!agent.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(agent.id)}
                    disabled={deletingAgent === agent.id}
                    title="Eliminar agente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}