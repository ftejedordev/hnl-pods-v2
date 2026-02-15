"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface ComboboxOption {
  value: string
  label: string
  data?: any
  disabled?: boolean
  tooltip?: string
}

interface ComboboxProps {
  value?: string
  onValueChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  renderOption?: (option: ComboboxOption) => React.ReactNode
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  className,
  disabled = false,
  renderOption,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
      option.value.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [options, searchValue])

  return (
    <TooltipProvider delayDuration={300}>
      <Popover 
        open={open} 
        onOpenChange={(isOpen) => {
          setOpen(isOpen)
          if (!isOpen) {
            setSearchValue("")
          }
        }}
      >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedOption
              ? (renderOption ? renderOption(selectedOption) : selectedOption.label)
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 max-h-[500px]">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-[400px]">
            {filteredOptions.length === 0 && (
              <CommandEmpty>No option found.</CommandEmpty>
            )}
            <CommandGroup>
              {filteredOptions.map((option) => {
                const commandItem = (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    onSelect={(currentValue) => {
                      if (option.disabled) return
                      onValueChange?.(currentValue === value ? "" : currentValue)
                      setOpen(false)
                    }}
                    className={cn(
                      option.disabled && "opacity-50 cursor-not-allowed text-muted-foreground"
                    )}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {renderOption ? renderOption(option) : option.label}
                  </CommandItem>
                )

                if (option.disabled && option.tooltip) {
                  return (
                    <Tooltip key={option.value} delayDuration={300}>
                      <TooltipTrigger asChild>
                        <div className="cursor-help" title={option.tooltip}>
                          {commandItem}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{option.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                return commandItem
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </TooltipProvider>
  )
}