import React, { useRef, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { VariableHighlighter } from './VariableHighlighter';

interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  variables: Record<string, any>;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export const VariableTextarea: React.FC<VariableTextareaProps> = ({
  value,
  onChange,
  variables,
  placeholder,
  rows = 2,
  className = ''
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll positions
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Handle input changes
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);
      
      // Restore cursor position after state update
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  // Update textarea when value changes externally
  useEffect(() => {
    if (textareaRef.current && textareaRef.current.value !== value) {
      textareaRef.current.value = value;
    }
  }, [value]);

  return (
    <div className="relative">
      {/* Syntax highlighted background */}
      <div
        ref={highlightRef}
        className={`absolute inset-0 pointer-events-none overflow-hidden rounded-md border border-transparent bg-transparent px-3 py-2 ${className}`}
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'transparent',
          zIndex: 1
        }}
        aria-hidden="true"
      >
        <VariableHighlighter
          text={value + ' '} // Add space to maintain layout
          variables={variables}
          className="text-foreground"
        />
      </div>
      
      {/* Transparent auto-resizing textarea for input */}
      <TextareaAutosize
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        minRows={rows}
        maxRows={20}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        className={`w-full relative resize-none border border-input bg-transparent px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 rounded-md caret-foreground ${className}`}
        style={{
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'transparent',
          zIndex: 2,
          fontFamily: 'inherit',
          fontSize: 'inherit'
        }}
      />
    </div>
  );
};