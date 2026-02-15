import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Repeat, X } from "lucide-react";

interface CustomEdgeProps extends EdgeProps {
  data?: {
    isFeedbackLoop?: boolean;
    isRunning?: boolean;
    isCompleted?: boolean;
    isFailed?: boolean;
    feedbackLoopState?: {
      isActive: boolean;
      currentIteration: number;
      maxIterations: number;
      sourceStepId: string;
      targetStepId: string;
    };
    onConvertToFeedbackLoop?: (edgeId: string) => void;
  };
}

export const CustomEdge: React.FC<CustomEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const { getEdges, deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeClick = () => {
    // Find the edge to delete
    const edges = getEdges();
    const edgeToDelete = edges.find(edge => edge.id === id);
    
    if (edgeToDelete) {
      // Use React Flow's deleteElements to properly trigger onEdgesDelete
      deleteElements({ edges: [edgeToDelete] });
    }
  };

  // Enhanced styling based on edge state
  const isActive = data?.isRunning || data?.isCompleted || data?.isFeedbackLoop;
  const edgeStyle = {
    ...style,
    stroke: data?.isRunning
      ? "#8b5cf6" // Purple for running (flow-primary)
      : data?.isCompleted
        ? "#10b981" // Green for completed
        : data?.isFailed
          ? "#ef4444" // Red for failed
          : "#059669", // Default green
    strokeWidth: isActive ? 2.5 : 2,
  };

  // Add particle flow animation class if running
  const edgeClass = data?.isRunning ? 'edge-particle-flow edge-active-glow' : '';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={edgeStyle}
        className={edgeClass}
      />
      <EdgeLabelRenderer>
        <div
          className="button-edge__label nodrag nopan flex gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          <button
            className="button-edge__button"
            onClick={onEdgeClick}
            title="Delete connection"
          >
            <X size={16} />
          </button>

          <button
            className={`button-edge__button button-edge__repeat ${data?.isFeedbackLoop ? "button-edge__repeat--active" : ""}`}
            title="Create feedback loop"
            onClick={() => data?.onConvertToFeedbackLoop?.(id)}
          >
            <Repeat size={16} />
          </button>
        </div>

        {/* Feedback loop indicator */}
        {data?.isFeedbackLoop && data?.feedbackLoopState && (
          <div
            className="absolute bg-purple-100 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-md px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 shadow-sm pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 25}px)`,
            }}
          >
            {data.feedbackLoopState.isActive ? (
              <>
                Iteration {data.feedbackLoopState.currentIteration}/
                {data.feedbackLoopState.maxIterations}
              </>
            ) : (
              <>Feedback Loop</>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};

export default CustomEdge;

