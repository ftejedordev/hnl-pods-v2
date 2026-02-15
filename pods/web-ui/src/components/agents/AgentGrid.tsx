import { useState, useEffect } from 'react';
import { Bot, Search, SlidersHorizontal } from 'lucide-react';
import type { Agent } from '@/types/agent';
import type { LLM } from '@/types/llm';
import { AgentCard } from './AgentCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { llmsApi } from '@/api/llms';

interface AgentGridProps {
  agents: Agent[];
  onEdit: (agent: Agent) => void;
  onDelete: (agentId: string) => void;
  isLoading?: boolean;
}

export function AgentGrid({ agents, onEdit, onDelete, isLoading }: AgentGridProps) {
  const [llms, setLlms] = useState<LLM[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDefaultAgents, setShowDefaultAgents] = useState(true);
  const [showCustomAgents, setShowCustomAgents] = useState(true);
  const [showConfigured, setShowConfigured] = useState(true);
  const [showUnconfigured, setShowUnconfigured] = useState(true);

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
    return llm ? `${llm.name}` : 'LLM no encontrado';
  };

  // Filter agents
  const filteredAgents = agents.filter(agent => {
    // Search filter
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.role?.toLowerCase().includes(searchQuery.toLowerCase());

    // Type filters
    const matchesType = (showDefaultAgents && agent.is_default) ||
                       (showCustomAgents && !agent.is_default);

    // Configuration filter
    const matchesConfig = (showConfigured && agent.llm_id) ||
                         (showUnconfigured && !agent.llm_id);

    return matchesSearch && matchesType && matchesConfig;
  });

  const hasActiveFilters = !showDefaultAgents || !showCustomAgents || !showConfigured || !showUnconfigured;
  const activeFiltersCount = [!showDefaultAgents, !showCustomAgents, !showConfigured, !showUnconfigured].filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <Bot className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="relative mb-6">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="h-12 w-12 text-primary" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No hay agentes disponibles</h3>
        <p className="text-muted-foreground text-center max-w-md">
          Crea tu primer agente para comenzar a automatizar tareas y procesos con IA.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar agentes por nombre, descripción o rol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50"
          />
        </div>

        {/* Filters Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="relative bg-background/50 backdrop-blur-sm border-border/50">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filtros
              {hasActiveFilters && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold">
                  {4 - activeFiltersCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Tipo de agente</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showDefaultAgents}
              onCheckedChange={setShowDefaultAgents}
            >
              Agentes del sistema
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showCustomAgents}
              onCheckedChange={setShowCustomAgents}
            >
              Agentes personalizados
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Configuración</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showConfigured}
              onCheckedChange={setShowConfigured}
            >
              Con LLM configurado
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showUnconfigured}
              onCheckedChange={setShowUnconfigured}
            >
              Sin LLM configurado
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando <span className="font-semibold text-foreground">{filteredAgents.length}</span> de{' '}
          <span className="font-semibold text-foreground">{agents.length}</span> agentes
        </p>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowDefaultAgents(true);
              setShowCustomAgents(true);
              setShowConfigured(true);
              setShowUnconfigured(true);
            }}
            className="text-xs"
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Grid */}
      {filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No se encontraron agentes</h3>
          <p className="text-muted-foreground text-center max-w-md text-sm">
            Intenta ajustar los filtros o la búsqueda para encontrar lo que necesitas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              llmName={getLlmName(agent.llm_id)}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
