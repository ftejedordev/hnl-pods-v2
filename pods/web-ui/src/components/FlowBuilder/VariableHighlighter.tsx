import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface VariableHighlighterProps {
  text: string;
  variables: Record<string, any>;
  className?: string;
}

export const VariableHighlighter: React.FC<VariableHighlighterProps> = ({ 
  text, 
  variables, 
  className = '' 
}) => {
  
  // Regular expression to match {{variable_name}} patterns
  const variablePattern = /\{\{([^}]+)\}\}/g;
  
  const highlightVariables = (text: string) => {
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = variablePattern.exec(text)) !== null) {
      const [fullMatch, variableName] = match;
      const startIndex = match.index;
      
      // Add text before the variable
      if (startIndex > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, startIndex)}
          </span>
        );
      }
      
      // Add the highlighted variable
      const variableValue = variables[variableName.trim()];
      parts.push(
        <TooltipProvider key={`var-${startIndex}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="cursor-help font-medium px-1 rounded"
                style={{
                  color: '#9333ea',
                  backgroundColor: 'rgba(147, 51, 234, 0.1)'
                }}
              >
                {fullMatch}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs">
                <div className="font-semibold">{variableName.trim()}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {variableValue !== undefined ? (
                    <span className="font-mono">
                      {typeof variableValue === 'string' 
                        ? `"${variableValue}"` 
                        : JSON.stringify(variableValue, null, 2)}
                    </span>
                  ) : (
                    <span className="text-red-500">Variable not defined</span>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
      
      lastIndex = startIndex + fullMatch.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }
    
    return parts;
  };
  
  return (
    <div className={className}>
      {highlightVariables(text)}
    </div>
  );
};