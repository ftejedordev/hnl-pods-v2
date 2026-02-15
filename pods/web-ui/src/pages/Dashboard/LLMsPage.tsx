import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Key, Plus, Settings, ExternalLink, Loader2, CheckCircle, Sparkles, DollarSign, Zap, RefreshCw } from 'lucide-react';
import type { LLM, LLMCreate, LLMUpdate, LLMProvider } from '@/types/llm';
import { LLMCard } from '@/components/llm/LLMCard';
import { useLLMs, useLLMProviders, useCreateLLM, useUpdateLLM, useDeleteLLM, useTestLLM } from '@/hooks/useLLMs';

export function LLMsPage() {
  const { data: llms = [], isLoading: loading } = useLLMs();
  const { data: providers = [] } = useLLMProviders();
  const createLLMMutation = useCreateLLM();
  const updateLLMMutation = useUpdateLLM();
  const deleteLLMMutation = useDeleteLLM();
  const testLLMMutation = useTestLLM();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingLLM, setEditingLLM] = useState<LLM | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [testingLLMs, setTestingLLMs] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState<LLMCreate>({
    name: '',
    description: '',
    provider: 'openai' as LLMProvider,
    api_key: '',
    config: {
      model_name: '',
      max_tokens: 4096,
      temperature: 0.7
    },
    is_default: false
  });

  const creating = createLLMMutation.isPending || updateLLMMutation.isPending;

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      provider: 'openai' as LLMProvider,
      api_key: '',
      config: {
        model_name: '',
        max_tokens: 4096,
        temperature: 0.7
      },
      is_default: false
    });
  };

  const getProviderSpecificConfig = (provider: LLMProvider, config: any) => {
    const baseConfig = {
      model_name: config.model_name,
      max_tokens: config.max_tokens,
      temperature: config.temperature
    };

    switch (provider) {
      case 'anthropic':
        return {
          ...baseConfig,
          anthropic_version: config.anthropic_version
        };
      case 'openai':
        return {
          ...baseConfig,
          organization_id: config.organization_id
        };
      case 'openrouter':
        return {
          ...baseConfig,
          site_url: config.site_url,
          app_name: config.app_name
        };
      case 'custom':
        return {
          ...baseConfig,
          base_url: config.base_url,
          headers: config.headers,
          verify_ssl: config.verify_ssl,
          available_models: config.available_models
        };
      default:
        return baseConfig;
    }
  };

  const handleCreateLLM = async () => {
    try {
      const cleanedFormData = {
        ...formData,
        config: getProviderSpecificConfig(formData.provider, formData.config)
      };
      const newLLM = await createLLMMutation.mutateAsync(cleanedFormData);
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: `LLM "${newLLM.name}" created successfully.`,
      });
    } catch (error: any) {
      console.error('Error creating LLM:', error);
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create LLM. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateLLM = async () => {
    if (!editingLLM) return;

    try {
      const updateData: LLMUpdate = {
        name: formData.name,
        description: formData.description,
        config: getProviderSpecificConfig(formData.provider, formData.config),
        is_default: formData.is_default
      };

      if (formData.api_key) {
        updateData.api_key = formData.api_key;
      }

      const updatedLLM = await updateLLMMutation.mutateAsync({ id: editingLLM.id, data: updateData });
      setIsEditDialogOpen(false);
      setEditingLLM(null);
      resetForm();
      toast({
        title: "Success",
        description: `LLM "${updatedLLM.name}" updated successfully.`,
      });
    } catch (error: any) {
      console.error('Error updating LLM:', error);
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update LLM. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLLM = async (llm: LLM) => {
    try {
      await deleteLLMMutation.mutateAsync(llm.id);
      toast({
        title: "Success",
        description: `LLM "${llm.name}" deleted successfully.`,
      });
    } catch (error: any) {
      console.error('Error deleting LLM:', error);
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete LLM. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleTestLLM = async (llm: LLM) => {
    try {
      setTestingLLMs(prev => new Set(prev).add(llm.id));
      const result = await testLLMMutation.mutateAsync({ id: llm.id });

      if (result.success) {
        toast({
          title: "Test Successful",
          description: `LLM "${llm.name}" is working correctly. Response: ${result.response_text?.substring(0, 100)}...`,
        });
      } else {
        toast({
          title: "Test Failed",
          description: result.error || "LLM test failed for an unknown reason.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error testing LLM:', error);
      toast({
        title: "Error",
        description: "Failed to test LLM connectivity.",
        variant: "destructive",
      });
    } finally {
      setTestingLLMs(prev => {
        const newSet = new Set(prev);
        newSet.delete(llm.id);
        return newSet;
      });
    }
  };

  const startEdit = (llm: LLM) => {
    setEditingLLM(llm);
    setFormData({
      name: llm.name,
      description: llm.description || '',
      provider: llm.provider,
      api_key: '', // Don't pre-fill for security
      config: llm.config,
      is_default: llm.is_default
    });
    setIsEditDialogOpen(true);
  };

  const getProviderInfo = (provider: LLMProvider) => {
    return providers.find(p => p.provider === provider);
  };

  // Calculate usage statistics from all LLMs
  const getUsageStats = () => {
    const totalCosts = llms.reduce((sum, llm) => sum + (llm.usage_stats.total_cost || 0), 0);
    const totalRequests = llms.reduce((sum, llm) => sum + (llm.usage_stats.total_requests || 0), 0);
    const monthlyRequests = llms.reduce((sum, llm) => sum + (llm.usage_stats.requests_this_month || 0), 0);
    const monthlyCosts = llms.reduce((sum, llm) => sum + (llm.usage_stats.cost_this_month || 0), 0);

    return {
      totalCosts,
      totalRequests,
      monthlyRequests,
      monthlyCosts
    };
  };

  const renderProviderFields = () => {
    const providerInfo = getProviderInfo(formData.provider);
    if (!providerInfo) return null;

    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="model-name">Model Name *</Label>
            <Input
              id="model-name"
              value={formData.config?.model_name || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                config: { ...prev.config, model_name: e.target.value }
              }))}
              placeholder={`e.g., ${providerInfo.supported_models?.[0] || 'model-name'}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-tokens">Max Tokens</Label>
            <Input
              id="max-tokens"
              type="number"
              value={formData.config?.max_tokens || 4096}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                config: { ...prev.config, max_tokens: parseInt(e.target.value) || 4096 }
              }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="temperature">Temperature</Label>
          <Input
            id="temperature"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={formData.config?.temperature || 0.7}
            onChange={(e) => setFormData(prev => ({
              ...prev,
              config: { ...prev.config, temperature: parseFloat(e.target.value) || 0.7 }
            }))}
          />
        </div>

        {/* Provider-specific fields */}
        {formData.provider === 'anthropic' && (
          <div className="space-y-2">
            <Label htmlFor="anthropic-version">Anthropic Version</Label>
            <Input
              id="anthropic-version"
              value={formData.config?.anthropic_version || '2023-06-01'}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                config: { ...prev.config, anthropic_version: e.target.value }
              }))}
              placeholder="2023-06-01"
            />
          </div>
        )}

        {formData.provider === 'openai' && (
          <div className="space-y-2">
            <Label htmlFor="organization-id">Organization ID (Optional)</Label>
            <Input
              id="organization-id"
              value={formData.config?.organization_id || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                config: { ...prev.config, organization_id: e.target.value }
              }))}
              placeholder="org-xxxxxxxxxxxxxxxxx"
            />
          </div>
        )}

        {formData.provider === 'openrouter' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="site-url">Site URL (Optional)</Label>
              <Input
                id="site-url"
                value={formData.config?.site_url || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, site_url: e.target.value }
                }))}
                placeholder="https://yourdomain.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-name">App Name (Optional)</Label>
              <Input
                id="app-name"
                value={formData.config?.app_name || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, app_name: e.target.value }
                }))}
                placeholder="Your App Name"
              />
            </div>
          </>
        )}

        {formData.provider === 'custom' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="base-url">Base URL *</Label>
              <Input
                id="base-url"
                value={formData.config?.base_url || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, base_url: e.target.value }
                }))}
                placeholder="https://chat.misael.software"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="verify-ssl"
                checked={formData.config?.verify_ssl !== false}
                onCheckedChange={(checked) => setFormData(prev => ({
                  ...prev,
                  config: { ...prev.config, verify_ssl: checked }
                }))}
              />
              <Label htmlFor="verify-ssl">Verify SSL</Label>
            </div>
          </>
        )}
      </>
    );
  };

  const handleToggleDefault = async (llm: LLM, isDefault: boolean) => {
    try {
      const updateData: LLMUpdate = {
        name: llm.name,
        description: llm.description,
        config: llm.config,
        is_default: isDefault
      };

      await updateLLMMutation.mutateAsync({ id: llm.id, data: updateData });

      toast({
        title: "Success",
        description: `LLM "${llm.name}" ${isDefault ? 'establecido como' : 'removido de'} default.`,
      });
    } catch (error: any) {
      console.error('Error toggling default:', error);
      toast({
        title: "Error",
        description: "Failed to update LLM default status.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Cargando LLMs...</span>
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
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight">LLM Providers</h2>
                <p className="text-muted-foreground">
                  Gestiona tus API keys y modelos de lenguaje
                </p>
              </div>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm} size="lg" className="shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" />
                Agregar LLM
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>Agregar Nuevo LLM</span>
              </DialogTitle>
              <DialogDescription>
                Configura un nuevo proveedor de LLM para usar en tus agentes y flujos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              {/* Info Básica */}
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-semibold">Información Básica</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="llm-name" className="flex items-center space-x-1">
                        <span>Nombre</span>
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="llm-name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ej: Mi Anthropic Claude"
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="llm-provider" className="flex items-center space-x-1">
                        <span>Proveedor</span>
                        <span className="text-red-500">*</span>
                      </Label>
                      <Select value={formData.provider} onValueChange={(value) => setFormData(prev => ({ ...prev, provider: value as LLMProvider }))}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecciona un proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((provider) => (
                            <SelectItem key={provider.provider} value={provider.provider}>
                              <div className="flex items-center justify-between w-full">
                                <span>{provider.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-description">Descripción</Label>
                    <Textarea
                      id="llm-description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descripción opcional del LLM"
                      rows={2}
                      className="bg-background"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* API Key */}
              <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Key className="h-4 w-4 text-green-500" />
                    </div>
                    <h3 className="font-semibold">Autenticación</h3>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="llm-api-key" className="flex items-center space-x-1">
                      <span>API Key</span>
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="llm-api-key"
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                      placeholder="Ingresa tu API key"
                      className="bg-background font-mono"
                    />
                    {getProviderInfo(formData.provider) && (
                      <p className="text-xs text-muted-foreground flex items-center space-x-1">
                        <span>Obtén tu API key en:</span>
                        <a
                          href={getProviderInfo(formData.provider)!.api_key_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          {getProviderInfo(formData.provider)!.name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Configuración del Modelo */}
              <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Settings className="h-4 w-4 text-blue-500" />
                    </div>
                    <h3 className="font-semibold">Configuración del Modelo</h3>
                  </div>

                  {renderProviderFields()}
                </CardContent>
              </Card>

              {/* Opciones Avanzadas */}
              <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold">LLM por defecto</h3>
                        <p className="text-xs text-muted-foreground">Usar este LLM como predeterminado para nuevos agentes</p>
                      </div>
                    </div>
                    <Switch
                      id="is-default"
                      checked={formData.is_default}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_default: checked }))}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Botones */}
              <div className="flex justify-end space-x-2 pt-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateLLM} disabled={creating || !formData.name || !formData.api_key}>
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Plus className="mr-2 h-4 w-4" />
                  Crear LLM
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Key className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total LLMs</p>
                <p className="text-2xl font-bold">{llms.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold">{llms.filter(l => l.status === 'active').length}</p>
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
                <p className="text-sm text-muted-foreground">Requests Mes</p>
                <p className="text-2xl font-bold">{getUsageStats().monthlyRequests.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Costo Mes</p>
                <p className="text-2xl font-bold">${getUsageStats().monthlyCosts.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LLM Cards Grid */}
      {llms.length === 0 ? (
        <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
          <CardContent className="py-16">
            <div className="text-center space-y-6">
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 bg-primary/10 rounded-full flex items-center justify-center">
                  <Sparkles className="w-12 h-12 text-primary" />
                </div>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">No hay LLMs aún</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Agrega tu primer LLM para empezar a usar modelos de lenguaje en tus agentes
                </p>
              </div>
              <Button onClick={() => setIsCreateDialogOpen(true)} size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Agregar LLM
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {llms.map((llm) => (
            <LLMCard
              key={llm.id}
              llm={llm}
              providerInfo={getProviderInfo(llm.provider)}
              isTesting={testingLLMs.has(llm.id)}
              onEdit={startEdit}
              onDelete={handleDeleteLLM}
              onTest={handleTestLLM}
              onToggleDefault={handleToggleDefault}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Settings className="h-5 w-5 text-primary" />
              <span>Editar LLM</span>
            </DialogTitle>
            <DialogDescription>
              Actualiza la configuración de tu LLM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Info Básica */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Key className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold">Información Básica</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-llm-name" className="flex items-center space-x-1">
                      <span>Nombre</span>
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-llm-name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ej: Mi Anthropic Claude"
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-llm-provider">Proveedor</Label>
                    <Input
                      id="edit-llm-provider"
                      value={getProviderInfo(formData.provider)?.name || formData.provider}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-llm-description">Descripción</Label>
                  <Textarea
                    id="edit-llm-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción opcional del LLM"
                    rows={2}
                    className="bg-background"
                  />
                </div>
              </CardContent>
            </Card>

            {/* API Key */}
            <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-transparent">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Key className="h-4 w-4 text-green-500" />
                  </div>
                  <h3 className="font-semibold">Autenticación</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-llm-api-key">Nuevo API Key (opcional)</Label>
                  <Input
                    id="edit-llm-api-key"
                    type="password"
                    value={formData.api_key}
                    onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
                    placeholder="Deja vacío para mantener el actual"
                    className="bg-background font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deja este campo vacío si no quieres cambiar el API key actual.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Configuración del Modelo */}
            <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Settings className="h-4 w-4 text-blue-500" />
                  </div>
                  <h3 className="font-semibold">Configuración del Modelo</h3>
                </div>

                {renderProviderFields()}
              </CardContent>
            </Card>

            {/* Opciones Avanzadas */}
            <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold">LLM por defecto</h3>
                      <p className="text-xs text-muted-foreground">Usar este LLM como predeterminado para nuevos agentes</p>
                    </div>
                  </div>
                  <Switch
                    id="edit-is-default"
                    checked={formData.is_default}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_default: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Botones */}
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdateLLM} disabled={creating || !formData.name}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle className="mr-2 h-4 w-4" />
                Actualizar LLM
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
