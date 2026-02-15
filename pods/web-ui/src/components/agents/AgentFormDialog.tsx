import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Search, Calendar, Bot, Sparkles, Link2, Palette, User, MessageSquare, CheckCircle2 } from 'lucide-react';
import type { Agent, AgentFormData } from '@/types/agent';
import type { McpServerConnection } from '@/types/mcp';
import type { LLM } from '@/types/llm';
import { mcpServerConnectionsApi } from '@/api/mcpServerConnections';
import { llmsApi } from '@/api/llms';
import type { RagServerDocument } from '@/types/rag';
import { ragApi } from '@/api/rag';

interface AgentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AgentFormData) => Promise<void>;
  agent?: Agent | null;
  isLoading?: boolean;
}

export function AgentFormDialog({ open, onOpenChange, onSubmit, agent, isLoading }: AgentFormDialogProps) {
  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    llm_id: undefined,
    mcp_connections: [],
    avatar_url: '',
    color: '#3B82F6',
    role: '',
    system_prompt: '',
    rag_documents: []
  });

  const [mcpConnections, setMcpConnections] = useState<McpServerConnection[]>([]);
  const [llms, setLlms] = useState<LLM[]>([]);
  const [documents, setDocuments] = useState<RagServerDocument[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [llmsLoading, setLlmsLoading] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [activeTab, setActiveTab] = useState('basic');

  // Load MCP connections and LLMs when dialog opens
  useEffect(() => {
    if (open) {
      loadMcpConnections();
      loadLlms();
      loadDocuments();
    }
  }, [open]);

  const loadMcpConnections = async () => {
    try {
      setMcpLoading(true);
      const connections = await mcpServerConnectionsApi.getAll();
      setMcpConnections(connections);
    } catch (error) {
      console.error('Error loading MCP connections:', error);
      setMcpConnections([]);
    } finally {
      setMcpLoading(false);
    }
  };

  const loadLlms = async () => {
    try {
      setLlmsLoading(true);
      const response = await llmsApi.getLLMs();
      setLlms(response.llms.filter(llm => llm.status === 'active'));
    } catch (error) {
      console.error('Error loading LLMs:', error);
      setLlms([]);
    } finally {
      setLlmsLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const response = await ragApi.getDocuments();
      setDocuments(response.documents);
    } catch (error) {
      console.error('Error loading documents:', error);
      setDocuments([]);
    }
  };

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description,
        llm_id: agent.llm_id,
        mcp_connections: agent.mcp_connections || [],
        avatar_url: agent.avatar_url || '',
        color: agent.color || '#3B82F6',
        role: agent.role || '',
        system_prompt: agent.system_prompt || '',
        rag_documents: agent.rag_documents || []
      });
    } else {
      setFormData({
        name: '',
        description: '',
        llm_id: undefined,
        mcp_connections: [],
        avatar_url: '',
        color: '#3B82F6',
        role: '',
        system_prompt: '',
        rag_documents: []
      });
    }
    setActiveTab('basic');
  }, [agent, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      console.log('Form data:', formData);
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleMcpConnectionToggle = (connectionId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      mcp_connections: checked
        ? [...prev.mcp_connections, connectionId]
        : prev.mcp_connections.filter(id => id !== connectionId)
    }));
  };

  const handleRagDocumentToggle = (documentId: number, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      rag_documents: checked
        ? [...prev.rag_documents, documentId]
        : prev.rag_documents.filter(id => id !== documentId)
    }));
  };

  // Filter documents based on search
  const filteredDocuments = documents.filter(doc =>
    doc.filename.toLowerCase().includes(documentSearch.toLowerCase())
  );

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  // Get file extension for icon
  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || 'txt';
  };

  // Check if tab has been completed (has data)
  const isTabCompleted = (tab: string) => {
    switch(tab) {
      case 'basic':
        return formData.name && formData.description;
      case 'llm':
        return formData.llm_id;
      case 'connections':
        return formData.mcp_connections.length > 0;
      case 'documents':
        return formData.rag_documents.length > 0;
      default:
        return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-7xl max-h-[90vh] overflow-hidden p-0">
        {/* Header with gradient */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-purple-500/10 to-primary/5 border-b border-primary/20 p-6">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:radial-gradient(white,transparent_85%)]" />
          <div className="relative">
            <DialogHeader>
              <div className="flex items-center space-x-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center backdrop-blur-sm">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl">
                    {agent ? 'Editar Agente' : 'Crear Nuevo Agente'}
                  </DialogTitle>
                  <DialogDescription>
                    {agent?.is_default
                      ? 'Configura conexiones MCP y LLM para este agente del sistema'
                      : agent
                        ? 'Modifica los detalles y capacidades del agente'
                        : 'Define un nuevo agente con sus conexiones y capacidades'
                    }
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Agent Preview */}
              <div className="lg:col-span-1">
                <Card className="sticky top-0 border-border/50 bg-gradient-to-br from-card via-card to-card/50 backdrop-blur-sm overflow-hidden">
                  <div className="relative p-6 space-y-6">
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-50" />

                    <div className="relative space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground flex items-center">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Vista Previa
                        </h3>
                        {agent?.is_default && (
                          <Badge variant="default" className="text-xs">
                            Sistema
                          </Badge>
                        )}
                      </div>

                      {/* Avatar Preview */}
                      <div className="flex flex-col items-center space-y-4 py-6">
                        <div className="relative">
                          {formData.avatar_url ? (
                            <div className="relative">
                              <img
                                src={formData.avatar_url}
                                alt="Avatar preview"
                                className="h-24 w-24 rounded-3xl object-contain bg-background/50 p-2 ring-4 ring-border/50 transition-all duration-300"
                                style={{ borderColor: formData.color }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                              <div
                                className="h-24 w-24 rounded-3xl flex items-center justify-center ring-4 ring-border/50 hidden"
                                style={{ backgroundColor: formData.color }}
                              >
                                <span className="text-white font-bold text-3xl">
                                  {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="h-24 w-24 rounded-3xl flex items-center justify-center ring-4 ring-border/50"
                              style={{ backgroundColor: formData.color }}
                            >
                              <span className="text-white font-bold text-3xl">
                                {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
                              </span>
                            </div>
                          )}
                          {/* Glow behind avatar */}
                          <div
                            className="absolute inset-0 rounded-3xl blur-2xl opacity-30"
                            style={{ backgroundColor: formData.color }}
                          />
                        </div>

                        <div className="text-center space-y-2">
                          <h3 className="font-bold text-xl">
                            {formData.name || 'Nombre del Agente'}
                          </h3>
                          {formData.role && (
                            <Badge variant="outline" className="border-primary/30 text-primary/80">
                              {formData.role}
                            </Badge>
                          )}
                          <p className="text-sm text-muted-foreground line-clamp-3 px-4">
                            {formData.description || 'Sin descripción'}
                          </p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="space-y-3 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/10">
                          <div className="flex items-center space-x-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">LLM</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formData.llm_id ? llms.find(l => l.id === formData.llm_id)?.name || 'Configurado' : 'No configurado'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
                          <div className="flex items-center space-x-2">
                            <Link2 className="h-4 w-4 text-purple-500" />
                            <span className="text-sm font-medium">Conexiones MCP</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {formData.mcp_connections.length}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium">Documentos RAG</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {formData.rag_documents.length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Right Column: Form Tabs */}
              <div className="lg:col-span-2">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                  <TabsList className="grid w-full grid-cols-4 h-auto p-1 bg-background/50 backdrop-blur-sm border border-border/50">
                    <TabsTrigger
                      value="basic"
                      className="flex flex-col items-center py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative"
                    >
                      <User className="h-5 w-5 mb-1" />
                      <span className="text-xs font-medium">Info Básica</span>
                      {isTabCompleted('basic') && (
                        <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-green-500" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="llm"
                      className="flex flex-col items-center py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative"
                    >
                      <Sparkles className="h-5 w-5 mb-1" />
                      <span className="text-xs font-medium">LLM</span>
                      {isTabCompleted('llm') && (
                        <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-green-500" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="connections"
                      className="flex flex-col items-center py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative"
                    >
                      <Link2 className="h-5 w-5 mb-1" />
                      <span className="text-xs font-medium">Conexiones</span>
                      {isTabCompleted('connections') && (
                        <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-green-500" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="documents"
                      className="flex flex-col items-center py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground relative"
                    >
                      <FileText className="h-5 w-5 mb-1" />
                      <span className="text-xs font-medium">Documentos</span>
                      {isTabCompleted('documents') && (
                        <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-green-500" />
                      )}
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab: Basic Info */}
                  <TabsContent value="basic" className="space-y-6">
                    <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="flex items-center text-base font-semibold">
                            <Bot className="h-4 w-4 mr-2 text-primary" />
                            Nombre del Agente *
                          </Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ej: Asistente de Desarrollo"
                            disabled={agent?.is_default}
                            required
                            className="h-11"
                          />
                          {agent?.is_default && (
                            <p className="text-xs text-muted-foreground">Los nombres de agentes del sistema no se pueden cambiar</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="role" className="flex items-center text-base font-semibold">
                            <Palette className="h-4 w-4 mr-2 text-purple-500" />
                            Rol del Agente
                          </Label>
                          <Input
                            id="role"
                            value={formData.role}
                            onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                            placeholder="Ej: Debug/Refactor, Arquitectura"
                            disabled={agent?.is_default}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="description" className="flex items-center text-base font-semibold">
                            <MessageSquare className="h-4 w-4 mr-2 text-blue-500" />
                            Descripción *
                          </Label>
                          <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Describe qué hace este agente y cuál es su propósito..."
                            rows={4}
                            disabled={agent?.is_default}
                            className="resize-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="color" className="text-base font-semibold">
                              Color del Agente
                            </Label>
                            <div className="flex items-center space-x-2">
                              <Input
                                id="color"
                                type="color"
                                value={formData.color}
                                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                className="w-20 h-11 p-1 rounded-lg border cursor-pointer"
                                disabled={agent?.is_default}
                              />
                              <Input
                                value={formData.color}
                                onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                                placeholder="#3B82F6"
                                className="flex-1 h-11"
                                disabled={agent?.is_default}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="avatar_url" className="text-base font-semibold">
                              Avatar URL
                            </Label>
                            <Input
                              id="avatar_url"
                              value={formData.avatar_url}
                              onChange={(e) => setFormData(prev => ({ ...prev, avatar_url: e.target.value }))}
                              placeholder="https://ejemplo.com/avatar.png"
                              disabled={agent?.is_default}
                              className="h-11"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Tab: LLM & Prompts */}
                  <TabsContent value="llm" className="space-y-6">
                    <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="llm" className="flex items-center text-base font-semibold">
                            <Sparkles className="h-4 w-4 mr-2 text-primary" />
                            Modelo LLM
                          </Label>
                          {llmsLoading ? (
                            <div className="h-11 bg-muted rounded-lg flex items-center px-3">
                              <span className="text-sm text-muted-foreground">Cargando LLMs...</span>
                            </div>
                          ) : (
                            <Select
                              value={formData.llm_id || 'none'}
                              onValueChange={(value) => setFormData(prev => ({ ...prev, llm_id: value === 'none' ? undefined : value }))}
                            >
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Seleccionar LLM (opcional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin LLM específico</SelectItem>
                                {llms.map((llm) => (
                                  <SelectItem key={llm.id} value={llm.id}>
                                    <div className="flex items-center justify-between w-full">
                                      <span className="font-medium">{llm.name}</span>
                                      <span className="text-xs text-muted-foreground ml-4">
                                        {llm.provider} • {llm.config.model_name}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {llms.length === 0 && !llmsLoading && (
                            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                                ⚠️ No hay LLMs activos disponibles. Ve a la pestaña LLMs para configurar uno.
                              </p>
                            </div>
                          )}
                        </div>

                        {formData.system_prompt !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor="system_prompt" className="flex items-center text-base font-semibold">
                              <MessageSquare className="h-4 w-4 mr-2 text-purple-500" />
                              System Prompt
                            </Label>
                            <Textarea
                              id="system_prompt"
                              value={formData.system_prompt}
                              onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                              placeholder="Instrucciones especiales para el agente..."
                              rows={12}
                              className="font-mono text-sm resize-none"
                              disabled={agent?.is_default}
                            />
                            {agent?.is_default && (
                              <p className="text-xs text-muted-foreground">Los system prompts de agentes del sistema no se pueden cambiar</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Tab: MCP Connections */}
                  <TabsContent value="connections" className="space-y-6">
                    <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center text-base font-semibold">
                            <Link2 className="h-4 w-4 mr-2 text-purple-500" />
                            Conexiones MCP Disponibles
                          </Label>
                          {formData.mcp_connections.length > 0 && (
                            <Badge variant="secondary">
                              {formData.mcp_connections.length} seleccionada(s)
                            </Badge>
                          )}
                        </div>

                        <div className="rounded-lg border border-border/50 p-4 max-h-[400px] overflow-y-auto">
                          {mcpLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                          ) : mcpConnections.length === 0 ? (
                            <div className="text-center py-8">
                              <Link2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                              <p className="text-muted-foreground text-sm">
                                No hay conexiones MCP disponibles.
                              </p>
                              <p className="text-muted-foreground text-xs mt-1">
                                Ve a la pestaña MCP para crear algunas conexiones primero.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {mcpConnections
                                .filter((conn: McpServerConnection) => conn.is_active)
                                .map((connection: McpServerConnection) => {
                                  const isSelected = formData.mcp_connections.includes(connection.id);
                                  return (
                                    <div
                                      key={connection.id}
                                      onClick={() => handleMcpConnectionToggle(connection.id, !isSelected)}
                                      className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                                        isSelected
                                          ? 'bg-primary/10 border-primary/30 shadow-sm'
                                          : 'bg-background border-border/50 hover:bg-muted/50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => handleMcpConnectionToggle(connection.id, e.target.checked)}
                                        className="h-5 w-5 rounded border-2 border-gray-300 text-primary accent-primary focus:ring-primary focus:ring-2"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <div className="flex-1">
                                        <p className="font-medium">{connection.name}</p>
                                        <p className="text-xs text-muted-foreground">{connection.transport_type}</p>
                                      </div>
                                      {isSelected && (
                                        <CheckCircle2 className="h-5 w-5 text-primary" />
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Tab: RAG Documents */}
                  <TabsContent value="documents" className="space-y-6">
                    <Card className="border-border/50 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm">
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="flex items-center text-base font-semibold">
                            <FileText className="h-4 w-4 mr-2 text-blue-500" />
                            Documentos RAG Disponibles
                          </Label>
                          {formData.rag_documents.length > 0 && (
                            <Badge variant="secondary">
                              {formData.rag_documents.length} seleccionado(s)
                            </Badge>
                          )}
                        </div>

                        {/* Search bar */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar documentos..."
                            value={documentSearch}
                            onChange={(e) => setDocumentSearch(e.target.value)}
                            className="pl-10 h-11"
                          />
                        </div>

                        <div className="rounded-lg border border-border/50 p-4 max-h-[400px] overflow-y-auto">
                          {documents.length === 0 ? (
                            <div className="text-center py-8">
                              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                              <p className="text-muted-foreground text-sm">
                                No hay documentos RAG disponibles.
                              </p>
                              <p className="text-muted-foreground text-xs mt-1">
                                Ve a la pestaña Documentos para cargar algunos documentos primero.
                              </p>
                            </div>
                          ) : filteredDocuments.length === 0 ? (
                            <div className="text-center py-8">
                              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                              <p className="text-muted-foreground text-sm">
                                No se encontraron documentos que coincidan con tu búsqueda.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {filteredDocuments.map((doc) => {
                                const isSelected = formData.rag_documents.includes(doc.id);
                                const fileExt = getFileExtension(doc.filename);

                                return (
                                  <div
                                    key={doc.id}
                                    onClick={() => handleRagDocumentToggle(doc.id, !isSelected)}
                                    className={`flex items-center space-x-3 p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                                      isSelected
                                        ? 'bg-primary/10 border-primary/30 shadow-sm'
                                        : 'bg-background border-border/50 hover:bg-muted/50'
                                    }`}
                                  >
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                                    }`}>
                                      <FileText className="h-5 w-5" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <p className="text-sm font-medium truncate">
                                          {doc.filename}
                                        </p>
                                        <Badge variant="outline" className="text-xs">
                                          {fileExt.toUpperCase()}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center space-x-2 mt-1">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground">
                                          {formatDate(doc.created_at)}
                                        </span>
                                      </div>
                                    </div>

                                    {isSelected && (
                                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>

          {/* Footer with Actions */}
          <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm p-6">
            <DialogFooter className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                * Campos requeridos
              </div>
              <div className="flex space-x-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="lg">
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !formData.name.trim()}
                  size="lg"
                  className="min-w-[120px]"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      {agent ? 'Actualizar' : 'Crear'} Agente
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
