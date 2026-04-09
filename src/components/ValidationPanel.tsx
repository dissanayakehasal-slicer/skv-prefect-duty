import { useMemo } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { AlertCircle, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

export function ValidationPanel() {
  const { prefects, sections, dutyPlaces, assignments, autoFixConflicts } = usePrefectStore(useShallow((state) => ({
    prefects: state.prefects,
    sections: state.sections,
    dutyPlaces: state.dutyPlaces,
    assignments: state.assignments,
    autoFixConflicts: state.autoFixConflicts,
  })));
  const issues = useMemo(() => usePrefectStore.getState().validate(), [prefects, sections, dutyPlaces, assignments]);

  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Validation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Check for assignment conflicts and issues</p>
      </div>

      {issues.length === 0 ? (
        <div
          className="duty-card flex items-center gap-4"
          style={{ borderColor: 'hsl(var(--success) / 0.3)', boxShadow: 'var(--glow-success)' }}
        >
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--success) / 0.1)' }}>
            <ShieldCheck className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="font-semibold text-foreground">All Clear</p>
            <p className="text-sm text-muted-foreground">No conflicts detected — assignments are valid.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="duty-card">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Errors</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{errors.length}</p>
            </div>
            <div className="duty-card">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Warnings</span>
              </div>
              <p className="text-2xl font-bold text-warning">{warnings.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-primary/30 text-primary hover:bg-primary/10"
              onClick={async () => {
                const res = await autoFixConflicts();
                toast.success(`Fixed conflicts: ${res.fixedSameLeader} same-leader, ${res.clearedLeadership} extra leadership, ${res.clearedAssignments} leader-duty assignments`);
              }}
            >
              Auto-fix conflicts
            </Button>
          </div>

            {errors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Errors
                </h3>
                {errors.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                    style={{ borderColor: 'hsl(var(--destructive) / 0.2)', background: 'hsl(var(--destructive) / 0.05)' }}
                  >
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <Badge variant="outline" className="text-xs mr-2 border-destructive/20">{issue.category.replace(/_/g, ' ')}</Badge>
                      <span className="text-foreground">{issue.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-warning flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Warnings
                </h3>
                {warnings.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                    style={{ borderColor: 'hsl(var(--warning) / 0.2)', background: 'hsl(var(--warning) / 0.05)' }}
                  >
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <Badge variant="outline" className="text-xs mr-2 border-warning/20">{issue.category.replace(/_/g, ' ')}</Badge>
                      <span className="text-foreground">{issue.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </>
      )}
    </div>
  );
}
