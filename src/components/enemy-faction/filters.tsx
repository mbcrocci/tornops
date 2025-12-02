import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type OnlineStatusFilter = "Online" | "Idle" | "Offline";
export type StateFilter = "Okay" | "Hospital" | "Abroad" | "Traveling";
export type FFFilter = "0-2" | "2-4" | "4-6" | "6+";

export interface FilterState {
  onlineStatus: OnlineStatusFilter[];
  state: StateFilter[];
  ff: FFFilter[];
}

interface FiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

function FilterToggleGroup<T extends string>({
  label,
  options,
  selected,
  onValueChange,
}: {
  label: string;
  options: T[];
  selected: T[];
  onValueChange: (value: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <ToggleGroup
        type="multiple"
        value={selected}
        onValueChange={(value) => onValueChange(value as T[])}
        variant="outline"
        size="default"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option} aria-label={option}>
            {option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function Filters({ filters, onFiltersChange }: FiltersProps) {
  const handleOnlineStatusChange = (value: string[]) => {
    onFiltersChange({
      ...filters,
      onlineStatus: value as OnlineStatusFilter[],
    });
  };

  const handleStateChange = (value: string[]) => {
    onFiltersChange({
      ...filters,
      state: value as StateFilter[],
    });
  };

  const handleFFChange = (value: string[]) => {
    onFiltersChange({
      ...filters,
      ff: value as FFFilter[],
    });
  };

  return (
    <div className="flex items-start gap-4 flex-wrap">
      <FilterToggleGroup
        label="Online Status"
        options={["Online", "Idle", "Offline"] as OnlineStatusFilter[]}
        selected={filters.onlineStatus}
        onValueChange={handleOnlineStatusChange}
      />
      <FilterToggleGroup
        label="State"
        options={["Okay", "Hospital", "Abroad", "Traveling"] as StateFilter[]}
        selected={filters.state}
        onValueChange={handleStateChange}
      />
      <FilterToggleGroup
        label="Fair Fight"
        options={["0-2", "2-4", "4-6", "6+"] as FFFilter[]}
        selected={filters.ff}
        onValueChange={handleFFChange}
      />
    </div>
  );
}
