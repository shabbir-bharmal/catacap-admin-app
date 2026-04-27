import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export interface MultiSelectOption<Id extends string | number = number> {
  id: Id;
  name: string;
}

interface MultiSelectPopoverProps<Id extends string | number = number> {
  label?: string;
  options: MultiSelectOption<Id>[];
  selected: Id[];
  onToggle: (id: Id) => void;
  placeholder: string;
  testId?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  showChips?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export function MultiSelectPopover<Id extends string | number = number>({
  options,
  selected,
  onToggle,
  placeholder,
  testId,
  searchPlaceholder = "Search…",
  emptyMessage = "No options available",
  showChips = false,
  triggerClassName,
  contentClassName,
  disabled = false,
}: MultiSelectPopoverProps<Id>) {
  const [open, setOpen] = useState(false);
  const selectedOptions = options.filter((o) => selected.includes(o.id));
  const selectedNames = selectedOptions.map((o) => o.name).join(", ");

  return (
    <div className="space-y-2 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-9 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              triggerClassName
            )}
            data-testid={testId}
          >
            <span
              className={cn(
                "flex-1 min-w-0 truncate text-left",
                !selectedNames && "text-muted-foreground"
              )}
            >
              {selectedNames || placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className={cn("w-72 p-0", contentClassName)}
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList
              className="max-h-60 overflow-y-auto overscroll-contain"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const isChecked = selected.includes(opt.id);
                  return (
                    <CommandItem
                      key={String(opt.id)}
                      value={opt.name}
                      onSelect={() => onToggle(opt.id)}
                      className="flex items-center gap-2 cursor-pointer"
                      data-testid={testId ? `${testId}-option-${opt.id}` : undefined}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => onToggle(opt.id)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm">{opt.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {showChips && selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid={testId ? `${testId}-chips` : undefined}>
          {selectedOptions.map((opt) => (
            <span
              key={String(opt.id)}
              className="inline-flex items-center gap-1 rounded bg-[#405189]/10 text-[#405189] px-2.5 py-1 text-xs font-medium"
            >
              {opt.name}
              <button
                type="button"
                className="ml-0.5 hover:text-[#f06548] transition-colors"
                onClick={() => onToggle(opt.id)}
                aria-label={`Remove ${opt.name}`}
                data-testid={testId ? `${testId}-chip-remove-${opt.id}` : undefined}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default MultiSelectPopover;
