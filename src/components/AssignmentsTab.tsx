import { useMemo, useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import type { Prefect } from '@/types/prefect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Wand2, Trash2, UserPlus, AlertCircle, CheckCircle2, Circle, Crown, Shield, Trophy, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

function SearchablePrefectPicker({
  value,
  onValueChange,
  options,
  disabled,
}: {
  value: string;
  onValueChange: (id: string) => void;
  options: Prefect[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || options.length === 0}
          className={cn(
            'w-44 h-8 justify-between text-xs font-normal px-2 bg-muted/20 border-border/40',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {selected
              ? `${selected.name} (G${selected.grade}, ${selected.gender?.[0] ?? '?'})`
              : options.length === 0
                ? 'No prefects'
                : 'Pick prefect…'}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,20rem)] p-0" align="end">
        {/* Only mount cmdk when open — one list per row × all prefects was freezing the app */}
        {open && (
          <Command shouldFilter>
            <CommandInput placeholder="Search name, reg no, grade…" className="h-9" />
            <CommandList>
              <CommandEmpty>No prefect found.</CommandEmpty>
              <CommandGroup>
                {options.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.regNo} ${p.id}`}
                    keywords={[String(p.grade), p.gender ?? '', p.regNo]}
                    onSelect={() => {
                      onValueChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">
                      {p.name} <span className="text-muted-foreground">· {p.regNo}</span> (G{p.grade},{' '}
                      {p.gender?.[0] ?? '—'})
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface AssignmentsTabProps {
  /** Viewer role: no assign, auto, or clear */
  readOnly?: boolean;
}

export function AssignmentsTab({ readOnly = false }: AssignmentsTabProps) {
  const { sections, dutyPlaces, prefects, assignments, assignPrefect, removeAssignment, autoAssign, autoFillRemaining, clearAllAssignments } = usePrefectStore(useShallow((state) => ({
    sections: state.sections,
    dutyPlaces: state.dutyPlaces,
    prefects: state.prefects,
    assignments: state.assignments,
    assignPrefect: state.assignPrefect,
    removeAssignment: state.removeAssignment,
    autoAssign: state.autoAssign,
    autoFillRemaining: state.autoFillRemaining,
    clearAllAssignments: state.clearAllAssignments,
  })));

  const [rowSelections, setRowSelections] = useState<Record<string, string>>({});
  const assignedPrefectIds = useMemo(() => new Set(assignments.map((assignment) => assignment.prefectId)), [assignments]);
  const leaderPrefectIds = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach((section) => {
      if (section.headId) ids.add(section.headId);
      if (section.coHeadId) ids.add(section.coHeadId);
    });
    return ids;
  }, [sections]);
  const assignmentsByDutyPlace = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    assignments.forEach((assignment) => {
      const current = map.get(assignment.dutyPlaceId);
      if (current) current.push(assignment);
      else map.set(assignment.dutyPlaceId, [assignment]);
    });
    return map;
  }, [assignments]);
  const prefectById = useMemo(() => new Map(prefects.map((prefect) => [prefect.id, prefect])), [prefects]);
  const available = useMemo(() => (
    prefects
      .filter((p) => {
        if (p.isHeadPrefect || p.isDeputyHeadPrefect || p.isGamesCaptain) return false;
        if (assignedPrefectIds.has(p.id)) return false;
        if (leaderPrefectIds.has(p.id)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [assignedPrefectIds, leaderPrefectIds, prefects]);

  const onDutyPrefects = useMemo(() => prefects.filter((p) => assignedPrefectIds.has(p.id) || leaderPrefectIds.has(p.id)), [assignedPrefectIds, leaderPrefectIds, prefects]);
  const freePrefects = useMemo(() => prefects.filter((p) => !p.isHeadPrefect && !p.isDeputyHeadPrefect && !p.isGamesCaptain && !assignedPrefectIds.has(p.id) && !leaderPrefectIds.has(p.id)), [assignedPrefectIds, leaderPrefectIds, prefects]);
  const headPrefects = useMemo(() => prefects.filter((p) => p.isHeadPrefect), [prefects]);
  const deputyHeadPrefects = useMemo(() => prefects.filter((p) => p.isDeputyHeadPrefect), [prefects]);
  const gamesCaptains = useMemo(() => prefects.filter((p) => p.isGamesCaptain), [prefects]);

  const handleAutoAssign = async () => {
    try {
      const result = await autoAssign();
      toast.success(`Auto-assigned ${result.assigned} (${result.skipped} skipped)`);
      if (result.vacancies.length > 0) toast.warning(`${result.vacancies.length} vacancies remaining`);
      if (result.violations.length > 0) toast.warning(`${result.violations.length} violations — check Validation`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auto-assign failed');
    }
  };

  const handleAutoFill = async () => {
    try {
      const result = await autoFillRemaining();
      toast.success(`Auto-filled ${result.assigned} (${result.skipped} skipped)`);
      if (result.vacancies.length > 0) toast.warning(`${result.vacancies.length} vacancies remaining`);
      if (result.violations.length > 0) toast.warning(`${result.violations.length} issues — check Validation`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auto-fill failed');
    }
  };

  const handleAssign = async (dutyPlaceId: string, sectionId: string) => {
    const selectedPrefect = rowSelections[dutyPlaceId];
    if (!selectedPrefect) { toast.error('Select a prefect first'); return; }
    const err = await assignPrefect(selectedPrefect, dutyPlaceId, sectionId);
    if (err) { toast.error(err); return; }
    setRowSelections((prev) => { const next = { ...prev }; delete next[dutyPlaceId]; return next; });
    toast.success('Assigned');
  };

  const renderDutyRow = (dp: typeof dutyPlaces[0], sectionId: string) => {
    const dpAssignments = assignmentsByDutyPlace.get(dp.id) ?? [];
    const currentCount = dpAssignments.length;
    const min = dp.minPrefects ?? 0;
    const max = dp.maxPrefects === 0 ? Infinity : (dp.maxPrefects || 1);
    const isFull = currentCount >= max;
    const belowMin = currentCount < min;
    const isEmpty = currentCount === 0;

    return (
      <div
        key={dp.id}
        className={`flex items-center justify-between rounded-lg border p-3 text-sm transition-all ${
          belowMin && min > 0 ? 'border-destructive/30 bg-destructive/5' :
          isFull ? 'border-success/20 bg-success/5' : 'border-border/30 bg-muted/10'
        }`}
      >
        <div className="flex items-center gap-2 min-w-[160px]">
          <span className="font-medium text-foreground">{dp.name}</span>
          {dp.isSpecial && <Badge variant="outline" className="text-xs border-primary/30 text-primary">Special</Badge>}
          {belowMin && min > 0 && <AlertCircle className="h-3 w-3 text-destructive" />}
          <span className="text-xs text-muted-foreground">({currentCount}/{min}–{dp.maxPrefects === 0 ? '∞' : max})</span>
        </div>

        <div className="flex items-center gap-2 flex-1 justify-center flex-wrap">
          {dpAssignments.map((a) => {
            const p = prefectById.get(a.prefectId);
            return p ? (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: 'hsl(38 100% 56% / 0.1)', color: 'hsl(38 100% 56%)' }}
              >
                {p.name} (G{p.grade}, {p.gender[0]})
                {!readOnly && (
                  <button type="button" onClick={() => { removeAssignment(a.id); toast.success('Removed'); }} className="ml-1 hover:text-destructive transition-colors">×</button>
                )}
              </span>
            ) : null;
          })}
          {isEmpty && <span className="text-muted-foreground italic text-xs">Vacant</span>}
        </div>

        {!isFull && !readOnly && (
          <div className="flex items-center gap-1.5 min-w-[240px] justify-end">
            <SearchablePrefectPicker
              value={rowSelections[dp.id] || ''}
              onValueChange={(v) => setRowSelections((prev) => ({ ...prev, [dp.id]: v }))}
              options={available}
            />
            <Button variant="outline" size="sm" className="h-8 text-xs border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleAssign(dp.id, sectionId)} disabled={!rowSelections[dp.id]}>
              <UserPlus className="h-3 w-3 mr-1" /> Assign
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Assignments</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {readOnly ? 'View-only — assignments cannot be changed' : 'Assign prefects to duty places'}
          </p>
        </div>
        {!readOnly && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleAutoAssign}>
            <Wand2 className="h-4 w-4 mr-1" /> Auto-Assign
          </Button>
          <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={handleAutoFill}>
            <Wand2 className="h-4 w-4 mr-1" /> Auto-Fill Remaining
          </Button>
          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { clearAllAssignments(); toast.success('All cleared'); }}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear All
          </Button>
        </div>
        )}
      </div>

      {/* Leadership Cards */}
      {(headPrefects.length > 0 || deputyHeadPrefects.length > 0 || gamesCaptains.length > 0) && (
        <div className="duty-card">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leadership (Excluded from Duty)</span>
          <div className="flex flex-wrap gap-2 mt-3">
            {headPrefects.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'hsl(38 100% 56% / 0.15)', color: 'hsl(38 100% 56%)' }}>
                <Crown className="h-3 w-3" /> {p.name} (G{p.grade}) — Head Prefect
              </span>
            ))}
            {deputyHeadPrefects.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'hsl(210 80% 55% / 0.15)', color: 'hsl(210 80% 55%)' }}>
                <Shield className="h-3 w-3" /> {p.name} (G{p.grade}) — Deputy
              </span>
            ))}
            {gamesCaptains.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'hsl(146 70% 40% / 0.15)', color: 'hsl(146 70% 40%)' }}>
                <Trophy className="h-3 w-3" /> {p.name} (G{p.grade}) — Games Captain
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="duty-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">On Duty</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{onDutyPrefects.length}</p>
        </div>
        <div className="duty-card">
          <div className="flex items-center gap-2 mb-1">
            <Circle className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{freePrefects.length}</p>
        </div>
        <div className="duty-card">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leadership</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{headPrefects.length + deputyHeadPrefects.length + gamesCaptains.length}</p>
        </div>
        <div className="duty-card">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Assigned</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{assignments.length}</p>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, i) => {
        const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
        if (sectionDps.length === 0 && !section.name.includes('SECTION')) return null;

        const head = prefects.find((p) => p.id === section.headId);
        const coHead = prefects.find((p) => p.id === section.coHeadId);

        return (
          <div
            key={section.id}
            className="duty-card space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">{section.name}</h3>
              <div className="flex gap-2 text-xs">
                {head && <span className="badge-info">Head: {head.name}</span>}
                {coHead && <span className="badge-info">Co-Head: {coHead.name}</span>}
              </div>
            </div>
            <div className="space-y-1.5">
              {sectionDps.map((dp) => renderDutyRow(dp, section.id))}
            </div>
          </div>
        );
      })}

      {/* General Duties */}
      {(() => {
        const generalDps = dutyPlaces.filter((dp) => !dp.sectionId);
        if (generalDps.length === 0) return null;
        return (
          <div className="duty-card space-y-3">
            <h3 className="font-bold text-foreground">GENERAL DUTIES</h3>
            <div className="space-y-1.5">
              {generalDps.map((dp) => renderDutyRow(dp, ''))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
