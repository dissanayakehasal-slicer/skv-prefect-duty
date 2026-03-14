import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wand2, Trash2, ArrowRightLeft, UserPlus, UserMinus, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function AssignmentsTab() {
  const store = usePrefectStore();
  const { sections, dutyPlaces, prefects, assignments, assignPrefect, removeAssignment, autoAssign, clearAllAssignments, getAvailablePrefects, getAssignedPrefect, setSectionHead, setSectionCoHead } = store;
  const [selectedPrefect, setSelectedPrefect] = useState<string>('');

  const available = getAvailablePrefects();

  const handleAutoAssign = () => {
    const result = autoAssign();
    toast.success(`Auto-assigned ${result.assigned} prefects (${result.skipped} skipped)`);
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

      <p className="text-sm text-muted-foreground">
        Available prefects: <strong>{available.length}</strong> / {prefects.filter((p) => !p.isHeadPrefect && !p.isDeputyHeadPrefect).length} | 
        Assignments: <strong>{assignments.length}</strong>
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
              {sectionDps.map((dp) => {
                const dpAssignments = getAssignedPrefect(dp.id);
                const maxSlots = dp.maxPrefects || 1;
                const isFull = dpAssignments.length >= maxSlots;
                const isEmpty = dpAssignments.length === 0;

                return (
                  <div key={dp.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${isEmpty && dp.isMandatory ? 'border-destructive/50 bg-destructive/5' : 'bg-muted/30'}`}>
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <span className="font-medium">{dp.name}</span>
                      {dp.isSpecial && <Badge variant="outline" className="text-xs">Special</Badge>}
                      {dp.isMandatory && isEmpty && <AlertCircle className="h-3 w-3 text-destructive" />}
                    </div>

                    <div className="flex items-center gap-2 flex-1 justify-center flex-wrap">
                      {dpAssignments.map((a) => {
                        const p = prefects.find((pr) => pr.id === a.prefectId);
                        return p ? (
                          <span key={a.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
                            {p.name} (G{p.grade}, {p.gender[0]})
                            <button onClick={() => { removeAssignment(a.id); toast.success('Removed'); }} className="hover:text-destructive ml-1">×</button>
                          </span>
                        ) : null;
                      })}
                      {isEmpty && <span className="text-muted-foreground italic">Vacant</span>}
                    </div>

                    <div className="min-w-[80px] text-right">
                      {!isFull && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleAssign(dp.id, section.id)} disabled={!selectedPrefect}>
                          <UserPlus className="h-3 w-3 mr-1" /> Assign
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
