import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { FlowCreate, FlowStep, EdgeMetadata } from '../../types/flow';
import { useToast } from '../../components/ui/use-toast';
import { FlowBuilder } from '../../components/FlowBuilder/FlowBuilder';
import { flowsApi } from '../../api/flows';
import { DashboardLayout } from '../../components/Layout/DashboardLayout';

export const FlowBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const { flowId: paramFlowId } = useParams<{ flowId?: string }>();
  const [currentFlowId, setCurrentFlowId] = useState<string | undefined>(paramFlowId);
  const isEditMode = Boolean(currentFlowId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [startStepId, setStartStepId] = useState('');
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [edgeMetadata, setEdgeMetadata] = useState<Record<string, EdgeMetadata>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<string>('');
  const { toast } = useToast();

  const handleVariableUpdate = React.useCallback((oldKey: string, newKey: string, newValue: string) => {
    setVariables(prev => {
      const newVariables = { ...prev };
      
      // Remove old key if it's different
      if (oldKey !== newKey) {
        delete newVariables[oldKey];
      }
      
      // Set new value
      newVariables[newKey] = newValue;
      
      return newVariables;
    });
  }, []);

  const handleVariableDelete = React.useCallback((keyToDelete: string) => {
    setVariables(prev => {
      const newVariables = { ...prev };
      delete newVariables[keyToDelete];
      return newVariables;
    });
  }, []);

  // Sync currentFlowId with paramFlowId
  useEffect(() => {
    if (paramFlowId !== currentFlowId) {
      setCurrentFlowId(paramFlowId);
    }
  }, [paramFlowId]);

  useEffect(() => {
    if (isEditMode && currentFlowId) {
      loadFlow(currentFlowId);
    } else {
      // Reset form for new flow
      setName('');
      setDescription('');
      setSteps([]);
      setStartStepId('');
      setVariables({});
      setEdgeMetadata({});
      setLastSavedData('');
      setHasUnsavedChanges(false);
    }
  }, [currentFlowId, isEditMode]);

  // Track changes to detect unsaved changes
  useEffect(() => {
    if (!lastSavedData && isEditMode) return; // Skip if no initial data in edit mode
    
    const currentData = JSON.stringify({
      name: name.trim(),
      description: description.trim() || '',
      steps,
      start_step_id: startStepId,
      variables,
      edge_metadata: edgeMetadata
    });
    
    setHasUnsavedChanges(currentData !== lastSavedData);
  }, [name, description, steps, startStepId, variables, edgeMetadata, lastSavedData, isEditMode]);

  const loadFlow = async (id: string) => {
    setLoading(true);
    try {
      const flow = await flowsApi.getFlow(id);
      setName(flow.name);
      setDescription(flow.description || '');
      setSteps(flow.steps);
      setStartStepId(flow.start_step_id);
      setVariables(flow.variables);
      setEdgeMetadata(flow.edge_metadata || {});
      const initialData = JSON.stringify({
        name: flow.name,
        description: flow.description || '',
        steps: flow.steps,
        start_step_id: flow.start_step_id,
        variables: flow.variables,
        edge_metadata: flow.edge_metadata || {}
      });
      setLastSavedData(initialData);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Error loading flow:', error);
      toast({
        title: "Error",
        description: "Failed to load flow",
        variant: "destructive"
      });
      navigate('/dashboard/flows');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Flow name is required",
        variant: "destructive"
      });
      return;
    }

    if (steps.length === 0) {
      toast({
        title: "Error",
        description: "At least one step is required",
        variant: "destructive"
      });
      return;
    }

    if (!startStepId) {
      toast({
        title: "Error",
        description: "Start step must be selected",
        variant: "destructive"
      });
      return;
    }

    const stepIds = steps.map(step => step.id);
    if (!stepIds.includes(startStepId)) {
      toast({
        title: "Error",
        description: "Start step must be one of the flow steps",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      console.log('📦 Raw edgeMetadata:', edgeMetadata);
      console.log('📦 Steps before processing:', steps.map(s => ({ id: s.id, name: s.name })));

      // Build next_steps from edge_metadata before saving
      const stepsWithNextSteps = steps.map(step => {
        const nextSteps: string[] = [];
        Object.values(edgeMetadata).forEach((edge: any) => {
          console.log(`🔍 Checking edge:`, edge, `for step:`, step.id);
          if (edge.source_step_id === step.id) {
            console.log(`✅ Match! Adding ${edge.target_step_id} to next_steps of ${step.id}`);
            nextSteps.push(edge.target_step_id);
          }
        });

        return {
          ...step,
          next_steps: nextSteps
        };
      });

      console.log('🔗 Built next_steps:', stepsWithNextSteps.map(s => ({
        id: s.id,
        name: s.name,
        next_steps: s.next_steps
      })));

      const flowData: FlowCreate = {
        name: name.trim(),
        description: description.trim() || undefined,
        steps: stepsWithNextSteps,
        start_step_id: startStepId,
        variables,
        edge_metadata: edgeMetadata,
        metadata: {
          created_by: 'flow_builder',
          version: '1.0',
          edited_at: new Date().toISOString()
        }
      };

      if (isEditMode && currentFlowId) {
        await flowsApi.updateFlow(currentFlowId, flowData);
      } else {
        const createdFlow = await flowsApi.createFlow(flowData);
        // Update URL without reloading the component
        window.history.replaceState(null, '', `/dashboard/flows/edit/${createdFlow.id}`);
        // Update the flowId in state so execution works
        setCurrentFlowId(createdFlow.id);
      }

      // Update last saved data to current state
      const currentData = JSON.stringify({
        name: name.trim(),
        description: description.trim() || '',
        steps,
        start_step_id: startStepId,
        variables,
        edge_metadata: edgeMetadata
      });
      setLastSavedData(currentData);
      setHasUnsavedChanges(false);

      toast({
        title: "Success",
        description: isEditMode ? "Flow saved successfully" : "Flow created successfully"
      });
    } catch (error) {
      console.error('Error saving flow:', error);
      toast({
        title: "Error",
        description: "Failed to save flow",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/dashboard/flows');
  };

  if (loading) {
    return (
      <DashboardLayout hideSidebar>
        <div className="h-96 flex items-center justify-center">
          <div className="text-lg text-muted-foreground">Loading flow...</div>
        </div>
      </DashboardLayout>
    );
  }

  const handleAddVariable = () => {
    const newKey = `variable_${Object.keys(variables).length + 1}`;
    setVariables({
      ...variables,
      [newKey]: ''
    });
  };

  return (
    <DashboardLayout noPadding hideSidebar>
      <div className="h-screen flex overflow-hidden font-ibm-plex-mono">
        {/* Flow Builder Canvas with Integrated Panel */}
        <FlowBuilder
          steps={steps}
          onStepsChange={setSteps}
          edgeMetadata={edgeMetadata}
          onEdgeMetadataChange={setEdgeMetadata}
          startStepId={startStepId}
          onStartStepChange={setStartStepId}
          variables={variables}
          flowId={currentFlowId}
          flowName={name}
          flowDescription={description}
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          isEditMode={isEditMode}
          onFlowNameChange={setName}
          onFlowDescriptionChange={setDescription}
          onVariableUpdate={handleVariableUpdate}
          onVariableDelete={handleVariableDelete}
          onAddVariable={handleAddVariable}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    </DashboardLayout>
  );
};
