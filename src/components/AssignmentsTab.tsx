import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wand2, Trash2, UserPlus, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';

export function AssignmentsTab() {
  const store = usePrefectStore();
  const { sections, dutyPlaces, prefects, assignments, assignPrefect, removeAssignment, autoAssign, clearAllAssignments, getAvailablePrefects, getAssignedPrefect, getDutyCount } = store;
  const [selectedPrefect, setSelectedPrefect] = useState<string>('');

  const available = getAvailablePrefects();

  // On-duty vs free prefects
  const onDutyPrefects = prefects.filter((p) => getDutyCount(p.id) > 0);
  const freePrefects = prefects.filter((p) => !p.isHeadPrefect && getDutyCount(p.id) === 0);

  const handleAutoAssign = () => {
    const result = autoAssign();
    const msg = `Auto-assigned ${result.assigned} (${result.skipped} skipped)`;
    const vacMsg = result.vacancies.length > 0 ? ` | ${result.vacancies.length} vacancies remaining` : '';
    toast.success(msg + vacMsg);
    if (result.violations.length > 0) {
      toast.warning(`${result.violations.length} violations detected — check Validation tab`);
    }
  };

  const handleAssign = (dutyPlaceId: string, sectionId: string) => {
    if (!selectedPrefect) { toast.error('Select a prefect first'); return; }
    const err = assignPrefect(selectedPrefect, dutyPlaceId, sectionId);
    if (err) { toast.error(err); return; }
    setSelectedPrefect('');
    toast.success('Assigned');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-foreground">Assignments</h2>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2 bg-card border rounded-lg px-3 py-1.5">
            <span className="text-sm text-muted-foreground">Assign:</span>
            <Select value={selectedPrefect} onValueChange={setSelectedPrefect}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Pick prefect..." /></SelectTrigger>
              <SelectContent>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} (G{p.grade}, {p.gender[0]})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAutoAssign} className="bg-primary">
            <Wand2 className="h-4 w-4 mr-1" /> Auto-Assign
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { clearAllAssignments(); toast.success('All assignments cleared'); }}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear All
          </Button>
        </div>
      </div>

      {/* On-Duty / Free Prefects Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-semibold text-sm text-foreground">On Duty ({onDutyPrefects.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {onDutyPrefects.length === 0 && <span className="text-xs text-muted-foreground italic">No prefects on duty yet</span>}
            {onDutyPrefects.map((p) => (
              <span key={p.id} className="inline-flex items-center bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full px-2 py-0.5 text-xs font-medium">
                {p.name} (G{p.grade})
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-sm text-foreground">Free ({freePrefects.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {freePrefects.length === 0 && <span className="text-xs text-muted-foreground italic">All prefects assigned!</span>}
            {freePrefects.map((p) => (
              <span key={p.id} className="inline-flex items-center bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-full px-2 py-0.5 text-xs font-medium">
                {p.name} (G{p.grade})
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Total: <strong>{prefects.length}</strong> prefects | On Duty: <strong>{onDutyPrefects.length}</strong> | Free: <strong>{freePrefects.length}</strong> | Assignments: <strong>{assignments.length}</strong>
      </p>

      {sections.map((section) => {
        const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
        if (sectionDps.length === 0 && !section.name.includes('SECTION')) return null;

        const head = prefects.find((p) => p.id === section.headId);
        const coHead = prefects.find((p) => p.id === section.coHeadId);

        return (
          <div key={section.id} className="duty-card space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">{section.name}</h3>
              <div className="flex gap-3 text-xs">
                {head && <span className="badge-info">Head: {head.name}</span>}
                {coHead && <span className="badge-info">Co-Head: {coHead.name}</span>}
              </div>
            </div>

            <div className="grid gap-1.5">
              {sectionDps.map((dp) => renderDutyRow(dp, section.id))}
            </div>
          </div>
        );
      })}

      {/* General Duties (no section) */}
      {(() => {
        const generalDps = dutyPlaces.filter((dp) => !dp.sectionId);
        if (generalDps.length === 0) return null;
        return (
          <div className="duty-card space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">GENERAL DUTIES</h3>
            </div>
            <div className="grid gap-1.5">
              {generalDps.map((dp) => renderDutyRow(dp, ''))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}