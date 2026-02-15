import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';

interface VariableEditorProps {
  initialKey: string;
  initialValue: string;
  onUpdate: (oldKey: string, newKey: string, newValue: string) => void;
  onDelete: (key: string) => void;
  existingKeys: string[];
  className?: string;
}

export const VariableEditor: React.FC<VariableEditorProps> = React.memo(({
  initialKey,
  initialValue,
  onUpdate,
  onDelete,
  existingKeys,
  className = ''
}) => {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setKey(initialKey);
    setValue(initialValue);
  }, [initialKey, initialValue]);

  const handleKeyChange = useCallback((newKey: string) => {
    setKey(newKey);
    
    // Check for duplicate keys
    const isDuplicate = newKey !== initialKey && existingKeys.includes(newKey);
    setHasError(isDuplicate || newKey.trim() === '');
  }, [initialKey, existingKeys]);

  const handleValueChange = useCallback((newValue: string) => {
    setValue(newValue);
  }, []);

  const handleKeyBlur = useCallback(() => {
    const trimmedKey = key.trim();
    if (trimmedKey !== '' && trimmedKey !== initialKey && !existingKeys.includes(trimmedKey)) {
      onUpdate(initialKey, trimmedKey, value);
    } else if (trimmedKey === '') {
      setKey(initialKey); // Reset to original if empty
    }
  }, [key, initialKey, existingKeys, value, onUpdate]);

  const handleValueBlur = useCallback(() => {
    if (value !== initialValue) {
      onUpdate(initialKey, key, value);
    }
  }, [value, initialValue, initialKey, key, onUpdate]);

  return (
    <div className="space-y-2 p-2 border border-border/50 rounded bg-background/50">
      <div className="flex gap-2 items-center">
        <Input
          value={key}
          onChange={(e) => handleKeyChange(e.target.value)}
          onBlur={handleKeyBlur}
          className={`flex-1 ${hasError ? 'border-red-500' : ''} ${className}`}
          placeholder="Variable name"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(initialKey)}
          className={`px-2 ${className}`}
        >
          ×
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => handleValueChange(e.target.value)}
        onBlur={handleValueBlur}
        className={`w-full ${className}`}
        placeholder="Variable value"
        rows={3}
      />
    </div>
  );
});