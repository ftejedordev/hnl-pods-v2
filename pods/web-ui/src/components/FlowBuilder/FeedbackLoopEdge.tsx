import React, { useState } from 'react';
import { 
  BaseEdge, 
  EdgeLabelRenderer, 
  getStraightPath, 
  type EdgeProps
} from '@xyflow/react';
import './FeedbackLoopEdge.css';

interface BidirectionalFeedbackLoopEdgeData extends Record<string, unknown> {
  isFeedbackLoop?: boolean;
  qualityThreshold?: number;
  maxIterations?: number;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  isDragging?: boolean;
  feedbackLoopState?: {
    isActive: boolean;
    currentIteration: number;
    maxIterations: number;
    sourceStepId: string;
    targetStepId: string;
  };
  onConfigureFeedbackLoop?: (edgeId: string) => void;
  onConvertToFeedbackLoop?: (edgeId: string) => void;
  onRemoveFeedbackLoop?: (edgeId: string) => void;
}

export const FeedbackLoopEdgeComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  data,
  markerEnd,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  
  // Debug log to confirm component is loading
  React.useEffect(() => {
    console.log('🔄 FeedbackLoopEdgeComponent mounted for edge:', id);
  }, [id]);

  const edgeData = data as BidirectionalFeedbackLoopEdgeData;
  const isFeedbackLoop = edgeData?.isFeedbackLoop || false;
  const isRunning = edgeData?.isRunning || false;
  const isCompleted = edgeData?.isCompleted || false;
  const isFailed = edgeData?.isFailed || false;
  const isDragging = edgeData?.isDragging || false;
  const feedbackLoopState = edgeData?.feedbackLoopState;
  const isFeedbackLoopActive = feedbackLoopState?.isActive || false;

  // Debug dragging state changes
  React.useEffect(() => {
    if (isDragging) {
      console.log('🔄 Edge', id, 'detected dragging - disabling animations');
    } else {
      console.log('🔄 Edge', id, 'dragging stopped - enabling animations');
    }
  }, [isDragging, id]);
  
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  // Determine the CSS class for the execution state
  const getExecutionStateClass = () => {
    if (isRunning || isFeedbackLoopActive) return 'feedback-loop-running';
    if (isCompleted) return 'feedback-loop-completed';
    if (isFailed) return 'feedback-loop-failed';
    return '';
  };

  // Calculate endpoint positions for hover indicators
  const endpointRadius = 16; // Half size from 32 to 16
  const clickRadius = 20; // Half size from 40 to 20
  const sourceEndpointX = sourceX;
  const sourceEndpointY = sourceY;
  const targetEndpointX = targetX;
  const targetEndpointY = targetY;

  const handleEdgeClick = (event: React.MouseEvent) => {
    console.log('🔄 Edge clicked for feedback loop configuration', { edgeId: id });
    event.stopPropagation();
    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
    setShowContextMenu(true);
  };

  const handleEndpointClick = (event: React.MouseEvent, endpoint: 'source' | 'target') => {
    console.log(`🔄 Feedback loop endpoint clicked: ${endpoint}`, { edgeId: id, isFeedbackLoop });
    event.stopPropagation();
    event.preventDefault();
    
    // If it's already a feedback loop, configure it; if not, convert it
    if (isFeedbackLoop) {
      console.log('🔄 Opening feedback loop configuration modal');
      edgeData?.onConfigureFeedbackLoop?.(id);
    } else {
      console.log('🔄 Converting to feedback loop directly');
      edgeData?.onConvertToFeedbackLoop?.(id);
    }
  };

  const handleLabelClick = (event: React.MouseEvent) => {
    console.log('🔄 Feedback loop label clicked', { edgeId: id });
    event.stopPropagation();
    event.preventDefault();
    
    // Open the configuration modal when the label is clicked
    edgeData?.onConfigureFeedbackLoop?.(id);
  };

  const handleContextMenuAction = (action: string) => {
    setShowContextMenu(false);
    
    switch (action) {
      case 'convert':
        edgeData?.onConvertToFeedbackLoop?.(id);
        break;
      case 'configure':
        edgeData?.onConfigureFeedbackLoop?.(id);
        break;
      case 'remove':
        edgeData?.onRemoveFeedbackLoop?.(id);
        break;
    }
  };

  // Close context menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <>
      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: isFeedbackLoop ? '#7c3aed' : (style as any)?.stroke || 'hsl(var(--border))',
          strokeWidth: isFeedbackLoop ? 3 : ((style as any)?.strokeWidth || 2),
          strokeDasharray: isFeedbackLoop ? '5,5' : undefined,
          cursor: 'pointer',
        }}
        onClick={handleEdgeClick}
        onMouseEnter={() => {
          console.log('🔄 Edge hover started', { 
            edgeId: id, 
            endpointRadius, 
            clickRadius,
            isFeedbackLoop 
          });
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          console.log('🔄 Edge hover ended');
          setIsHovered(false);
        }}
      />
      
      {/* Always-visible feedback loop indicators */}
      <circle
        cx={sourceEndpointX}
        cy={sourceEndpointY}
        r={isHovered ? 20 : 12}
        fill={isFeedbackLoop ? "rgba(124, 58, 237, 0.4)" : "rgba(124, 58, 237, 0.2)"}
        stroke="#7c3aed"
        strokeWidth={isHovered ? 2 : 1.5}
        strokeDasharray={isFeedbackLoop ? "4,2" : "6,3"}
        className={`feedback-loop-endpoint-indicator ${isRunning ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''} ${isFeedbackLoop ? 'feedback-active' : ''}`}
        onClick={(e) => handleEndpointClick(e as any, 'source')}
        onMouseEnter={() => {
          console.log('🔄 Source circle hovered');
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          console.log('🔄 Source circle unhovered');
          setIsHovered(false);
        }}
        style={{ 
          cursor: 'pointer',
          pointerEvents: 'all',
          transition: isDragging ? 'none' : 'all 0.2s ease-in-out',
          animation: isDragging ? 'none' : undefined
        }}
      >
        <title>{isFeedbackLoop ? 'Click to configure feedback loop' : 'Click to enable feedback loop'}</title>
      </circle>
      
      <circle
        cx={targetEndpointX}
        cy={targetEndpointY}
        r={isHovered ? 20 : 12}
        fill={isFeedbackLoop ? "rgba(124, 58, 237, 0.4)" : "rgba(124, 58, 237, 0.2)"}
        stroke="#7c3aed"
        strokeWidth={isHovered ? 2 : 1.5}
        strokeDasharray={isFeedbackLoop ? "4,2" : "6,3"}
        className={`feedback-loop-endpoint-indicator ${isRunning ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${isDragging ? 'dragging' : ''} ${isFeedbackLoop ? 'feedback-active' : ''}`}
        onClick={(e) => handleEndpointClick(e as any, 'target')}
        onMouseEnter={() => {
          console.log('🔄 Target circle hovered');
          setIsHovered(true);
        }}
        onMouseLeave={() => {
          console.log('🔄 Target circle unhovered');
          setIsHovered(false);
        }}
        style={{ 
          cursor: 'pointer',
          pointerEvents: 'all',
          transition: isDragging ? 'none' : 'all 0.2s ease-in-out',
          animation: isDragging ? 'none' : undefined
        }}
      >
        <title>{isFeedbackLoop ? 'Click to configure feedback loop' : 'Click to enable feedback loop'}</title>
      </circle>
      
      {/* Small center dots to indicate interactivity */}
      <circle
        cx={sourceEndpointX}
        cy={sourceEndpointY}
        r="3"
        fill="#7c3aed"
        style={{ pointerEvents: 'none' }}
      />
      
      <circle
        cx={targetEndpointX}
        cy={targetEndpointY}
        r="3"
        fill="#7c3aed"
        style={{ pointerEvents: 'none' }}
      />

      {/* Edge label for feedback loops */}
      {isFeedbackLoop && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 12,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div 
              className={`feedback-loop-label bg-purple-600 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:bg-purple-700 transition-colors ${getExecutionStateClass()}`}
              onClick={handleLabelClick}
            >
              <span className="text-sm">↔</span>
              <span className="font-medium">
                {isFeedbackLoopActive ? 'COLLABORATING...' : 'BIDIRECTIONAL FEEDBACK'}
              </span>
              {isFeedbackLoopActive && feedbackLoopState ? (
                <span className="text-purple-200 text-xs">
                  ({feedbackLoopState.currentIteration}/{feedbackLoopState.maxIterations})
                </span>
              ) : edgeData?.maxIterations ? (
                <span className="text-purple-200 text-xs">({edgeData.maxIterations} max)</span>
              ) : null}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Subtle indicator for non-feedback-loop edges */}
      {!isFeedbackLoop && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div className="bg-gray-500 dark:bg-gray-600 text-white px-2 py-1 rounded text-xs opacity-0 hover:opacity-100 transition-opacity">
              Click circles to enable feedback loop
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Context menu */}
      {showContextMenu && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'fixed',
              top: Math.min(contextMenuPosition.y, window.innerHeight - 200),
              left: Math.min(contextMenuPosition.x, window.innerWidth - 250),
              zIndex: 1000,
            }}
            className="feedback-loop-context-menu bg-white dark:bg-gray-800 border-2 border-purple-200 dark:border-purple-700 rounded-xl shadow-2xl py-3 min-w-56 backdrop-blur-sm"
          >
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span className={isFeedbackLoop ? "text-purple-700 dark:text-purple-300" : "text-gray-600 dark:text-gray-400"}>
                  🔄 Feedback Loop
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isFeedbackLoop 
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {isFeedbackLoop ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {isFeedbackLoop ? 'This connection uses feedback loops' : 'Standard connection'}
              </div>
            </div>
            
            {/* Toggle Button */}
            <button
              onClick={() => handleContextMenuAction(isFeedbackLoop ? 'remove' : 'convert')}
              className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                isFeedbackLoop
                  ? 'hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400'
                  : 'hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400'
              }`}
            >
              <span className="text-lg">{isFeedbackLoop ? '⏹️' : '🔄'}</span>
              <div>
                <div className="font-medium">
                  {isFeedbackLoop ? 'Disable Feedback Loop' : 'Enable Feedback Loop'}
                </div>
                <div className="text-xs opacity-70">
                  {isFeedbackLoop ? 'Convert back to regular connection' : 'Enable iterative improvement'}
                </div>
              </div>
            </button>

            {/* Configure Button (only shown when feedback loop is ON) */}
            {isFeedbackLoop && (
              <button
                onClick={() => handleContextMenuAction('configure')}
                className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 text-blue-600 dark:text-blue-400 transition-colors border-t border-gray-100 dark:border-gray-700"
              >
                <span className="text-lg">⚙️</span>
                <div>
                  <div className="font-medium">Configure Settings</div>
                  <div className="text-xs opacity-70">Adjust quality threshold & max iterations</div>
                </div>
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
