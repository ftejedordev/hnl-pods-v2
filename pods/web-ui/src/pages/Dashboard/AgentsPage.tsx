import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Bot, Settings, Sparkles, Link2, Zap, LayoutGrid, List } from 'lucide-react';
import { AgentTable } from '@/components/agents/AgentTable';
import { AgentGrid } from '@/components/agents/AgentGrid';
import { AgentFormDialog } from '@/components/agents/AgentFormDialog';
import type { Agent, AgentFormData } from '@/types/agent';
import { useAgents, useUserAgents, useDefaultAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from '@/hooks/useAgents';

export function AgentsPage() {
  const { data: agents = [], isLoading } = useAgents();
  const { data: userAgents = [] } = useUserAgents();
  const { data: defaultAgents = [] } = useDefaultAgents();
  const createAgentMutation = useCreateAgent();
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const isCreating = createAgentMutation.isPending;
  const isUpdating = updateAgentMutation.isPending;

  const handleCreateAgent = async (data: AgentFormData) => {
    try {
      await createAgentMutation.mutateAsync(data);
      setShowAgentForm(false);
    } catch (error) {
      console.error('Error creating agent:', error);
      throw error;
    }
  };

  const handleUpdateAgent = async (data: AgentFormData) => {
    if (!editingAgent) return;

    try {
      await updateAgentMutation.mutateAsync({ id: editingAgent.id, data });
      setShowAgentForm(false);
      setEditingAgent(null);
    } catch (error) {
      console.error('Error updating agent:', error);
      throw error;
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await deleteAgentMutation.mutateAsync(agentId);
    } catch (error) {
      console.error('Error deleting agent:', error);
    }
  };

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent);
    setShowAgentForm(true);
  };


  const handleNewAgent = () => {
    setEditingAgent(null);
    setShowAgentForm(true);
  };

  return (
    <div className="space-y-6">
      {/* Header with gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/10 to-primary/5 border border-primary/20 p-8">
        <div className="absolute inset-0 bg-grid-white/10 [mask-image:radial-gradient(white,transparent_85%)]" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Agentes IA</h2>
                <p className="text-muted-foreground">
                  Crea y gestiona agentes inteligentes potenciados por LLMs
                </p>
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="h-8"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-8"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            <Button onClick={handleNewAgent} size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              Crear Agente
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
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Agentes</p>
                <p className="text-2xl font-bold">{agents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Settings className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mis Agentes</p>
                <p className="text-2xl font-bold">{userAgents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Configurados</p>
                <p className="text-2xl font-bold">
                  {agents.filter(agent => agent.llm_id).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Link2 className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conexiones MCP</p>
                <p className="text-2xl font-bold">
                  {agents.reduce((total, agent) => total + (agent.mcp_connections?.length || 0), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 h-12 bg-background/50 backdrop-blur-sm border border-border/50">
          <TabsTrigger value="all" className="flex items-center space-x-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Bot className="h-4 w-4" />
            <span>Todos</span>
          </TabsTrigger>
          <TabsTrigger value="user" className="flex items-center space-x-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="h-4 w-4" />
            <span>Mis Agentes</span>
          </TabsTrigger>
          <TabsTrigger value="default" className="flex items-center space-x-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="h-4 w-4" />
            <span>Sistema</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          {viewMode === 'grid' ? (
            <AgentGrid
              agents={agents}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
              isLoading={isLoading}
            />
          ) : (
            <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Todos los Agentes</CardTitle>
                <CardDescription>
                  Lista completa de agentes disponibles (tuyos y predeterminados)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AgentTable
                  agents={agents}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="user" className="space-y-6">
          {viewMode === 'grid' ? (
            <AgentGrid
              agents={userAgents}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
              isLoading={isLoading}
            />
          ) : (
            <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Mis Agentes</CardTitle>
                <CardDescription>
                  Agentes creados por ti que puedes editar y eliminar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AgentTable
                  agents={userAgents}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="default" className="space-y-6">
          {viewMode === 'grid' ? (
            <AgentGrid
              agents={defaultAgents}
              onEdit={handleEditAgent}
              onDelete={handleDeleteAgent}
              isLoading={isLoading}
            />
          ) : (
            <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Agentes del Sistema</CardTitle>
                <CardDescription>
                  Agentes predefinidos disponibles para todos los usuarios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AgentTable
                  agents={defaultAgents}
                  onEdit={handleEditAgent}
                  onDelete={handleDeleteAgent}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Agent Form Dialog */}
      <AgentFormDialog
        open={showAgentForm}
        onOpenChange={setShowAgentForm}
        onSubmit={editingAgent ? handleUpdateAgent : handleCreateAgent}
        agent={editingAgent}
        isLoading={editingAgent ? isUpdating : isCreating}
      />

    </div>
  );
}
