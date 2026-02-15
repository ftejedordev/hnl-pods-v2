import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Workflow, TrendingUp, Zap, Search, Activity } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { createSampleFlow } from '../../api/flows';
import type { Flow, FlowExecution } from '../../types/flow';
import { useToast } from '../../components/ui/use-toast';
import { FlowExecutionMonitor } from '../../components/FlowExecution/FlowExecutionMonitor';
import { FlowCard } from '../../components/flows/FlowCard';
import { useFlows, useExecutions, useCreateFlow, useDeleteFlow, useExecuteFlow } from '@/hooks/useFlows';

export const FlowsPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: flows = [], isLoading: loadingFlows } = useFlows();
  const { data: executions = [] } = useExecutions();
  const createFlowMutation = useCreateFlow();
  const deleteFlowMutation = useDeleteFlow();
  const executeFlowMutation = useExecuteFlow();
  const [selectedExecution, setSelectedExecution] = useState<FlowExecution | null>(null);
  const [showExecutionMonitor, setShowExecutionMonitor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const createSampleFlowHandler = async () => {
    try {
      const sampleFlow = createSampleFlow(
        "Research & Analysis Flow",
        "A sample flow that demonstrates research, analysis, and parallel processing"
      );

      await createFlowMutation.mutateAsync(sampleFlow);

      toast({
        title: "Success",
        description: "Sample flow created successfully"
      });
    } catch (error) {
      console.error('Error creating sample flow:', error);
      toast({
        title: "Error",
        description: "Failed to create sample flow",
        variant: "destructive"
      });
    }
  };

  const executeFlow = async (flow: Flow) => {
    try {
      const execution = await executeFlowMutation.mutateAsync({
        flowId: flow.id,
        data: {
          input_data: { topic: "AI and Machine Learning trends" },
          variables: {}
        }
      });

      setSelectedExecution(execution);
      setShowExecutionMonitor(true);
    } catch (error) {
      console.error('Error executing flow:', error);
      toast({
        title: "Error",
        description: "Failed to execute flow",
        variant: "destructive"
      });
    }
  };

  const deleteFlow = async (flow: Flow) => {
    try {
      await deleteFlowMutation.mutateAsync(flow.id);

      toast({
        title: "Success",
        description: `Flow "${flow.name}" deleted successfully`
      });
    } catch (error) {
      console.error('Error deleting flow:', error);
      toast({
        title: "Error",
        description: "Failed to delete flow",
        variant: "destructive"
      });
    }
  };

  const getFlowExecutions = (flowId: string) => {
    return executions.filter(exec => exec.flow_id === flowId);
  };

  // Categorize flows
  const activeFlows = flows.filter(f => f.is_active && getFlowExecutions(f.id).length > 0);
  const inDevelopmentFlows = flows.filter(f => f.is_active && getFlowExecutions(f.id).length === 0);
  const pausedFlows = flows.filter(f => !f.is_active);

  // Filter flows by search
  const filterFlows = (flowsList: Flow[]) => {
    if (!searchQuery) return flowsList;
    return flowsList.filter(flow =>
      flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flow.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Calculate overall stats
  const totalFlows = flows.length;
  const totalExecutions = executions.length;
  const completedExecutions = executions.filter(e => e.status === 'completed').length;
  const successRate = totalExecutions > 0 ? Math.round((completedExecutions / totalExecutions) * 100) : 0;

  if (loadingFlows) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <Activity className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
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
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Agent Flows</h2>
                <p className="text-muted-foreground">
                  Orquesta workflows multi-agente inteligentes
                </p>
              </div>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button onClick={createSampleFlowHandler} variant="outline" size="lg" className="shadow-lg">
              <Plus className="mr-2 h-4 w-4" />
              Sample Flow
            </Button>
            <Button onClick={() => navigate('/flows/new')} size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Flow
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
                <Workflow className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Flows</p>
                <p className="text-2xl font-bold">{totalFlows}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold">{activeFlows.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Ejecuciones</p>
                <p className="text-2xl font-bold">{totalExecutions}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tasa de Éxito</p>
                <p className="text-2xl font-bold">{successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      {flows.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar flows por nombre o descripción..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-background/50 backdrop-blur-sm border-border/50 focus:border-primary/50"
          />
        </div>
      )}

      {/* Empty State */}
      {flows.length === 0 ? (
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="py-16">
            <div className="text-center space-y-6">
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 bg-primary/10 rounded-full flex items-center justify-center">
                  <Workflow className="w-12 h-12 text-primary" />
                </div>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">No hay flows aún</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Crea tu primer flow para comenzar a orquestar agentes inteligentes
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={createSampleFlowHandler} variant="outline" size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Flow de Ejemplo
                </Button>
                <Button onClick={() => navigate('/flows/new')} size="lg">
                  <Plus className="mr-2 h-4 w-4" />
                  Crear Flow
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Kanban Board */
        <div className="space-y-6">
          {/* Active Flows Column */}
          {filterFlows(activeFlows).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center space-x-2">
                      <span>Activos</span>
                      <Badge variant="secondary" className="ml-2">
                        {filterFlows(activeFlows).length}
                      </Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground">Flows con ejecuciones recientes</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filterFlows(activeFlows).map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    executions={getFlowExecutions(flow.id)}
                    onRun={executeFlow}
                    onEdit={(f) => navigate(`/flows/edit/${f.id}`)}
                    onDelete={deleteFlow}
                  />
                ))}
              </div>
            </div>
          )}

          {/* In Development Flows Column */}
          {filterFlows(inDevelopmentFlows).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center space-x-2">
                      <span>En Desarrollo</span>
                      <Badge variant="secondary" className="ml-2">
                        {filterFlows(inDevelopmentFlows).length}
                      </Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground">Flows nuevos sin ejecuciones</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filterFlows(inDevelopmentFlows).map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    executions={getFlowExecutions(flow.id)}
                    onRun={executeFlow}
                    onEdit={(f) => navigate(`/flows/edit/${f.id}`)}
                    onDelete={deleteFlow}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paused Flows Column */}
          {filterFlows(pausedFlows).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 rounded-xl bg-gray-500/10 flex items-center justify-center">
                    <Workflow className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold flex items-center space-x-2">
                      <span>Pausados</span>
                      <Badge variant="secondary" className="ml-2">
                        {filterFlows(pausedFlows).length}
                      </Badge>
                    </h3>
                    <p className="text-sm text-muted-foreground">Flows inactivos temporalmente</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filterFlows(pausedFlows).map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    executions={getFlowExecutions(flow.id)}
                    onRun={executeFlow}
                    onEdit={(f) => navigate(`/flows/edit/${f.id}`)}
                    onDelete={deleteFlow}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Results State */}
          {searchQuery &&
           filterFlows(activeFlows).length === 0 &&
           filterFlows(inDevelopmentFlows).length === 0 &&
           filterFlows(pausedFlows).length === 0 && (
            <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Search className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">No se encontraron flows</h3>
                    <p className="text-muted-foreground">
                      Intenta ajustar tu búsqueda o crea un nuevo flow
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Execution Monitor Dialog */}
      <FlowExecutionMonitor
        open={showExecutionMonitor}
        onOpenChange={setShowExecutionMonitor}
        execution={selectedExecution}
        onClose={() => {
          setSelectedExecution(null);
          setShowExecutionMonitor(false);
        }}
      />
    </div>
  );
};
