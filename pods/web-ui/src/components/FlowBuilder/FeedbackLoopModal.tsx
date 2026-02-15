import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { validateBidirectionalFeedbackLoopConfig } from './feedbackLoopUtils';

interface FeedbackLoopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: BidirectionalFeedbackLoopConfig) => void;
  onRemove?: () => void;
  config: BidirectionalFeedbackLoopConfig | null;
  sourceStepName?: string;
  targetStepName?: string;
}

export interface BidirectionalFeedbackLoopConfig {
  edgeId: string;
  sourceStepId: string;
  targetStepId: string;
  maxIterations: number;
  qualityThreshold: number;
  convergenceCriteria?: string;
}

export const FeedbackLoopModal: React.FC<FeedbackLoopModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onRemove,
  config,
  sourceStepName = 'Source Step',
  targetStepName = 'Target Step'
}) => {
  const [maxIterations, setMaxIterations] = useState(25);
  const [qualityThreshold, setQualityThreshold] = useState(0.8);
  const [convergenceCriteria, setConvergenceCriteria] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  // Initialize form with config data when modal opens
  useEffect(() => {
    if (config) {
      setMaxIterations(config.maxIterations);
      setQualityThreshold(config.qualityThreshold);
      setConvergenceCriteria(config.convergenceCriteria || '');
    } else {
      // Reset to defaults
      setMaxIterations(25);
      setQualityThreshold(0.8);
      setConvergenceCriteria('');
    }
    setErrors([]);
  }, [config, isOpen]);

  const handleSave = () => {
    if (!config) return;

    const validation = validateBidirectionalFeedbackLoopConfig({
      maxIterations,
      qualityThreshold,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    onSave({
      ...config,
      maxIterations,
      qualityThreshold,
      convergenceCriteria: convergenceCriteria.trim() || undefined,
    });
    
    onClose();
  };

  const handleCancel = () => {
    setErrors([]);
    onClose();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            🔄 Configure Bidirectional Feedback Loop
          </DialogTitle>
          <DialogDescription>
            Set up bidirectional communication between {sourceStepName} and {targetStepName} for iterative improvement.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-4">
          {/* Connection Info - Full Width */}
          <div className="bg-muted/50 p-3 rounded-lg mb-4">
            <div className="text-sm font-medium mb-2">Bidirectional Agent Communication</div>
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{sourceStepName}</span>
                <span>↔</span>
                <span className="font-medium text-foreground">{targetStepName}</span>
              </div>
              <div className="mt-1 text-xs">
                Both agents will collaborate iteratively. {sourceStepName} produces output, {targetStepName} provides feedback and improvements until quality standards are met.
              </div>
            </div>
          </div>

          {/* Error Messages - Full Width */}
          {errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <div className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                Please fix the following errors:
              </div>
              <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Simplified Controls */}
          <div className="space-y-6">
            {/* Max Iterations */}
            <div className="space-y-2">
              <Label htmlFor="max-iterations">Max Iterations</Label>
              <div className="space-y-2">
                <Input
                  id="max-iterations"
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span className="font-medium">{maxIterations} iterations</span>
                  <span>50</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Maximum number of bidirectional feedback cycles before stopping.
              </div>
            </div>

            {/* Quality Threshold */}
            <div className="space-y-2">
              <Label htmlFor="quality-threshold">Quality Threshold</Label>
              <div className="space-y-2">
                <Input
                  id="quality-threshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={qualityThreshold}
                  onChange={(e) => setQualityThreshold(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.0</span>
                  <span className="font-medium">{qualityThreshold.toFixed(2)} score</span>
                  <span>1.0</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Minimum quality score required to accept the final output and stop iterating.
              </div>
            </div>

            {/* Convergence Criteria */}
            <div className="space-y-2">
              <Label htmlFor="convergence-criteria">Convergence Criteria (Optional)</Label>
              <Textarea
                value={convergenceCriteria}
                onChange={(e) => setConvergenceCriteria(e.target.value)}
                placeholder="Additional criteria for when to stop the feedback loop..."
                rows={3}
                className="text-sm"
              />
              <div className="text-xs text-muted-foreground">
                Optional custom criteria that both agents should consider when deciding if the output is acceptable.
              </div>
            </div>

            {/* Information Box */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm">
                <div className="font-medium text-blue-800 dark:text-blue-200 mb-2">How bidirectional feedback loops work:</div>
                <ol className="text-blue-700 dark:text-blue-300 text-xs space-y-1 list-decimal list-inside">
                  <li>{sourceStepName} produces initial output</li>
                  <li>{targetStepName} evaluates and provides detailed feedback</li>
                  <li>If score ≥ threshold: loop completes successfully</li>
                  <li>If score &lt; threshold: {sourceStepName} improves based on feedback</li>
                  <li>Both agents continue collaborating until convergence or max iterations</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 flex-shrink-0">
          <div className="flex justify-between w-full">
            {/* Remove button - only show when editing existing feedback loop */}
            <div>
              {config && onRemove && (
                <Button 
                  variant="destructive" 
                  onClick={handleRemove}
                  className="mr-2"
                >
                  Remove Feedback Loop
                </Button>
              )}
            </div>
            
            {/* Cancel and Save buttons */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {config ? 'Update' : 'Create'} Bidirectional Feedback Loop
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};