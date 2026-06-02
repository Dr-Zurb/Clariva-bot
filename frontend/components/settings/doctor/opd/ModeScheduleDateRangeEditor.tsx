'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isPastDate, todayLocalIso } from '@/lib/dates';
import type { ModeScheduleDateRangeOverride, OpdMode } from '@/types/doctor-settings';
import { ModeSchedulePastDateAdvisory } from './ModeSchedulePastDateAdvisory';

function SortableRangeRow({
  row,
  index,
  onChange,
  onDelete,
}: {
  row: ModeScheduleDateRangeOverride;
  index: number;
  onChange: (row: ModeScheduleDateRangeOverride) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `range-${index}`,
  });
  const isFromPast = isPastDate(row.from);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="space-y-2 rounded-md border border-gray-200 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 hover:bg-gray-100"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Input
          type="date"
          value={row.from}
          onChange={(e) => onChange({ ...row, from: e.target.value })}
          className="w-40"
          aria-label="Range start date"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          value={row.to}
          onChange={(e) => onChange({ ...row, to: e.target.value })}
          className="w-40"
          aria-label="Range end date"
        />
        <Select value={row.mode} onValueChange={(m) => onChange({ ...row, mode: m as OpdMode })}>
          <SelectTrigger className="w-32" aria-label="Range mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="slot">Slot</SelectItem>
            <SelectItem value="queue">Queue</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label="Delete row"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {isFromPast && <ModeSchedulePastDateAdvisory />}
    </div>
  );
}

export interface ModeScheduleDateRangeEditorProps {
  value: ModeScheduleDateRangeOverride[];
  onChange: (ranges: ModeScheduleDateRangeOverride[]) => void;
}

export function ModeScheduleDateRangeEditor({ value, onChange }: ModeScheduleDateRangeEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = parseInt(String(active.id).replace('range-', ''), 10);
    const toIndex = parseInt(String(over.id).replace('range-', ''), 10);
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;
    onChange(arrayMove(value, fromIndex, toIndex));
  };

  const today = todayLocalIso();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label className="text-base font-semibold text-gray-900">Date-range overrides</Label>
          <p className="text-sm text-muted-foreground">Later rows win on overlap. Drag to reorder.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...value, { from: today, to: today, mode: 'slot' as OpdMode }])
          }
        >
          + Add range
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={value.map((_, i) => `range-${i}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {value.map((row, index) => (
              <SortableRangeRow
                key={`range-${index}`}
                row={row}
                index={index}
                onChange={(updated) => {
                  const next = [...value];
                  next[index] = updated;
                  onChange(next);
                }}
                onDelete={() => onChange(value.filter((_, i) => i !== index))}
              />
            ))}
            {value.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No date-range overrides. Click &quot;+ Add range&quot; to add one.
              </p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
