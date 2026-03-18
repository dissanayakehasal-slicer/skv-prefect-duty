import { usePrefectStore } from '@/store/prefectStore';
import { AlertCircle, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

export function ValidationPanel() {
  const { validate } = usePrefectStore();
  const issues = validate();

  const errors = issues.filter((i) => i.type === 'error');
  const warnings = issues.filter((i) => i.type === 'warning');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Validation</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Check for assignment conflicts and issues</p>
      </div>

      {issues.length === 0 ? (
        <motion.div
          className="duty-card flex items-center gap-4"
          style={{ borderColor: 'hsl(var(--success) / 0.3)', boxShadow: 'var(--glow-success)' }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--success) / 0.1)' }}>
            <ShieldCheck className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="font-semibold text-foreground">All Clear</p>
            <p className="text-sm text-muted-foreground">No conflicts detected — assignments are valid.</p>
          </div>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <motion.div className="duty-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Errors</span>
              </div>
              <p className="text-2xl font-bold text-destructive">{errors.length}</p>
            </motion.div>
            <motion.div className="duty-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Warnings</span>
              </div>
              <p className="text-2xl font-bold text-warning">{warnings.length}</p>
            </motion.div>
          </div>

          <AnimatePresence>
            {errors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> Errors
                </h3>
                {errors.map((issue, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                    style={{ borderColor: 'hsl(var(--destructive) / 0.2)', background: 'hsl(var(--destructive) / 0.05)' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <Badge variant="outline" className="text-xs mr-2 border-destructive/20">{issue.category.replace(/_/g, ' ')}</Badge>
                      <span className="text-foreground">{issue.message}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-warning flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Warnings
                </h3>
                {warnings.map((issue, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border p-3 text-sm"
                    style={{ borderColor: 'hsl(var(--warning) / 0.2)', background: 'hsl(var(--warning) / 0.05)' }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <Badge variant="outline" className="text-xs mr-2 border-warning/20">{issue.category.replace(/_/g, ' ')}</Badge>
                      <span className="text-foreground">{issue.message}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
