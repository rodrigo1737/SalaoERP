import { Grid2X2, List, Rows3 } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type CadastroViewMode = 'cards' | 'compact' | 'detailed';
export type CadastroPageSize = number | 'all';

interface ListViewControlsProps {
  viewMode?: CadastroViewMode;
  onViewModeChange?: (mode: CadastroViewMode) => void;
  pageSize: CadastroPageSize;
  onPageSizeChange: (size: CadastroPageSize) => void;
  totalItems: number;
  shownItems: number;
}

export const PAGE_SIZE_OPTIONS: CadastroPageSize[] = [20, 50, 100, 200, 'all'];

export function resolvePageSize(pageSize: CadastroPageSize, totalItems: number) {
  return pageSize === 'all' ? Math.max(totalItems, 1) : pageSize;
}

export function ListViewControls({
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  shownItems,
}: ListViewControlsProps) {
  const handlePageSizeChange = (value: string) => {
    onPageSizeChange(value === 'all' ? 'all' : Number(value));
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        Exibindo <span className="font-medium text-foreground">{shownItems}</span> de{' '}
        <span className="font-medium text-foreground">{totalItems}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {viewMode && onViewModeChange && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && onViewModeChange(value as CadastroViewMode)}
            className="justify-start"
          >
            <ToggleGroupItem value="cards" aria-label="Visualizar em cards" title="Cards">
              <Grid2X2 className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" aria-label="Visualizar lista resumida" title="Lista resumida">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="detailed" aria-label="Visualizar lista detalhada" title="Lista detalhada">
              <Rows3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Por página</span>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={String(option)} value={String(option)}>
                  {option === 'all' ? 'Todos' : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
