import { usePrefectStore } from '@/store/prefectStore';
import { AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function ValidationPanel() {
  const { validate } = usePrefectStore();
  const issues = validate();

  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Validation</h2>

      {issues.length === 0 ? (
        <div className="duty-card flex items-center gap-3 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">All assignments valid — no conflicts detected.</span>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="text-destructive font-medium">{errors.length} errors</span> · <span className="text-amber-600 font-medium">{warnings.length} warnings</span>
          </p>

          {errors.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Errors</h3>
              {errors.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <Badge variant="outline" className="text-xs mr-2">{issue.category.replace('_', ' ')}</Badge>
                    {issue.message}
                  </div>
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Warnings</h3>
              {warnings.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <Badge variant="outline" className="text-xs mr-2">{issue.category.replace('_', ' ')}</Badge>
                    {issue.message}
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
