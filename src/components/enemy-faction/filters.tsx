import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type OnlineStatusFilter = "Online" | "Idle" | "Offline";
export type StateFilter = "Okay" | "Hospital" | "Abroad" | "Traveling";
export type FFFilter = "<2" | "<4" | "<6";

export interface FilterState {
  onlineStatus: OnlineStatusFilter[];
  state: StateFilter[];
  ff: FFFilter[];
}

interface FiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

function FilterDropdown<T extends string>({
  label,
  options,
  selected,
  onSelectionChange,
}: {
  label: string;
  options: T[];
  selected: T[];
  onSelectionChange: (option: T, checked: boolean) => void;
}) {
  const hasSelection = selected.length > 0;

  // Format the button text to show selections
  const getButtonText = () => {
    if (!hasSelection) {
      return label;
    }

    // Show all selected items, comma-separated
    const selectedText = selected.join(", ");
    return `${label}: ${selectedText}`;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-9 px-3 text-sm", hasSelection && "bg-accent")}
        >
          {getButtonText()}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="space-y-3">
          <Label className="text-sm font-semibold">{label}</Label>
          <div className="space-y-2">
            {options.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <Checkbox
                  id={`${label}-${option}`}
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) =>
                    onSelectionChange(option, checked === true)
                  }
                />
                <Label
                  htmlFor={`${label}-${option}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {option}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Filters({ filters, onFiltersChange }: FiltersProps) {
  const handleOnlineStatusChange = (
    status: OnlineStatusFilter,
    checked: boolean
  ) => {
    const newFilters = {
      ...filters,
      onlineStatus: checked
        ? [...filters.onlineStatus, status]
        : filters.onlineStatus.filter((s) => s !== status),
    };
    onFiltersChange(newFilters);
  };

  const handleStateChange = (state: StateFilter, checked: boolean) => {
    const newFilters = {
      ...filters,
      state: checked
        ? [...filters.state, state]
        : filters.state.filter((s) => s !== state),
    };
    onFiltersChange(newFilters);
  };

  const handleFFChange = (ff: FFFilter, checked: boolean) => {
    const newFilters = {
      ...filters,
      ff: checked ? [...filters.ff, ff] : filters.ff.filter((f) => f !== ff),
    };
    onFiltersChange(newFilters);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterDropdown
        label="Online Status"
        options={["Online", "Idle", "Offline"] as OnlineStatusFilter[]}
        selected={filters.onlineStatus}
        onSelectionChange={handleOnlineStatusChange}
      />
      <FilterDropdown
        label="State"
        options={["Okay", "Hospital", "Abroad", "Traveling"] as StateFilter[]}
        selected={filters.state}
        onSelectionChange={handleStateChange}
      />
      <FilterDropdown
        label="Fair Fight"
        options={["<2", "<4", "<6"] as FFFilter[]}
        selected={filters.ff}
        onSelectionChange={handleFFChange}
      />
    </div>
  );
}
