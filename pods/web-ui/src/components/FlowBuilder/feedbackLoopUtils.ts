import type { FlowStep, EdgeMetadata } from '../../types/flow';

export interface CycleInfo {
  isFeedbackLoop: boolean;
  cycleSteps: string[];
  cycleLength: number;
}

/**
 * Detects if adding an edge from sourceId to targetId would create a feedback loop
 */
export function wouldCreateFeedbackLoop(
  steps: FlowStep[],
  sourceId: string,
  targetId: string
): CycleInfo {
  // Build adjacency list from current steps
  const adjacencyList = buildAdjacencyList(steps);
  
  // Temporarily add the new edge
  if (!adjacencyList[sourceId]) adjacencyList[sourceId] = [];
  adjacencyList[sourceId].push(targetId);
  
  // Check if this creates a cycle
  const cycle = detectCycle(adjacencyList, targetId, sourceId);
  
  return {
    isFeedbackLoop: cycle.length > 0,
    cycleSteps: cycle,
    cycleLength: cycle.length
  };
}

/**
 * Detects all existing feedback loops in the flow
 */
export function detectAllFeedbackLoops(steps: FlowStep[]): Map<string, CycleInfo> {
  const adjacencyList = buildAdjacencyList(steps);
  const feedbackLoops = new Map<string, CycleInfo>();
  
  // For each edge, check if it's part of a cycle
  steps.forEach(step => {
    step.next_steps.forEach(nextStepId => {
      const edgeId = `${step.id}-${nextStepId}`;
      const cycle = detectCycle(adjacencyList, nextStepId, step.id);
      
      if (cycle.length > 0) {
        feedbackLoops.set(edgeId, {
          isFeedbackLoop: true,
          cycleSteps: cycle,
          cycleLength: cycle.length
        });
      }
    });
  });
  
  return feedbackLoops;
}

/**
 * Checks if a specific edge is part of a feedback loop
 */
export function isEdgeFeedbackLoop(
  steps: FlowStep[],
  sourceId: string,
  targetId: string
): CycleInfo {
  const adjacencyList = buildAdjacencyList(steps);
  const cycle = detectCycle(adjacencyList, targetId, sourceId);
  
  return {
    isFeedbackLoop: cycle.length > 0,
    cycleSteps: cycle,
    cycleLength: cycle.length
  };
}

/**
 * Builds an adjacency list representation of the flow graph
 */
function buildAdjacencyList(steps: FlowStep[]): Record<string, string[]> {
  const adjacencyList: Record<string, string[]> = {};
  
  steps.forEach(step => {
    adjacencyList[step.id] = [...step.next_steps];
  });
  
  return adjacencyList;
}

/**
 * Detects if there's a path from startId back to targetId (creating a cycle)
 * Uses DFS to find cycles
 */
function detectCycle(
  adjacencyList: Record<string, string[]>,
  startId: string,
  targetId: string,
  visited: Set<string> = new Set(),
  path: string[] = []
): string[] {
  // If we've reached the target, we found a cycle
  if (startId === targetId && path.length > 0) {
    return [...path, startId];
  }
  
  // If we've visited this node in current path, we have a cycle (but not the one we want)
  if (visited.has(startId)) {
    return [];
  }
  
  visited.add(startId);
  path.push(startId);
  
  // Explore all neighbors
  const neighbors = adjacencyList[startId] || [];
  for (const neighbor of neighbors) {
    const cycle = detectCycle(adjacencyList, neighbor, targetId, new Set(visited), [...path]);
    if (cycle.length > 0) {
      return cycle;
    }
  }
  
  return [];
}

/**
 * Creates edge metadata for a bidirectional feedback loop
 */
export function createBidirectionalFeedbackLoopMetadata(
  edgeId: string,
  sourceStepId: string,
  targetStepId: string,
  config: {
    maxIterations?: number;
    qualityThreshold?: number;
    convergenceCriteria?: string;
  }
): EdgeMetadata {
  return {
    edge_id: edgeId,
    source_step_id: sourceStepId,
    target_step_id: targetStepId,
    is_feedback_loop: true,
    max_iterations: config.maxIterations || 25,
    quality_threshold: config.qualityThreshold || 0.8,
    convergence_criteria: config.convergenceCriteria,
    current_iteration: 0,
    feedback_history: [],
    quality_scores: [],
  };
}

/**
 * Checks if an edge has feedback loop enabled based on edge metadata
 */
export function isEdgeWithFeedbackLoop(
  edgeMetadata: Record<string, EdgeMetadata>,
  edgeId: string
): boolean {
  const metadata = edgeMetadata[edgeId];
  return metadata?.is_feedback_loop || false;
}

/**
 * Gets feedback loop configuration from edge metadata
 */
export function getBidirectionalFeedbackLoopConfig(
  edgeMetadata: Record<string, EdgeMetadata>,
  edgeId: string
): EdgeMetadata | null {
  const metadata = edgeMetadata[edgeId];
  return metadata?.is_feedback_loop ? metadata : null;
}

/**
 * Validates that a bidirectional feedback loop configuration is valid
 */
export function validateBidirectionalFeedbackLoopConfig(config: {
  maxIterations?: number;
  qualityThreshold?: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (config.maxIterations !== undefined) {
    if (config.maxIterations < 1 || config.maxIterations > 50) {
      errors.push('Max iterations must be between 1 and 50');
    }
  }
  
  if (config.qualityThreshold !== undefined) {
    if (config.qualityThreshold < 0 || config.qualityThreshold > 1) {
      errors.push('Quality threshold must be between 0.0 and 1.0');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}