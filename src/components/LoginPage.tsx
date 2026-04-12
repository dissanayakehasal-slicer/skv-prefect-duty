import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, KeyRound, Sparkles, User } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useAuthStore, hydrateAuth } from '@/store/authStore';
import { isSupabaseConfigured } from '@/lib/supabaseEnv';

export function LoginPage() {
  const bootstrapFirstAdmin = useAuthStore((s) => s.bootstrapFirstAdmin);
  const login = useAuthStore((s) => s.login);
  const authHydrated = useAuthStore((s) => s.authHydrated);

  const [isSetup, setIsSetup] = useState(false);

  useEffect(() => {
    void hydrateAuth().then(() => {
      setIsSetup(!useAuthStore.getState().hasAnyAccount());
    });
  }, []);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      toast.error('Enter username and password');
      return;
    }
    if (isSetup) {
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
    }
    setLoading(true);
    try {
      if (isSetup) {
        const err = await bootstrapFirstAdmin(username, password);
        if (err) toast.error(err);
        else toast.success('Admin account created — you are signed in');
      } else {
        const err = await login(username, password);
        if (err) toast.error(err);
        else toast.success('Signed in');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!authHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
              background: `hsl(38 100% 56% / ${0.1 + Math.random() * 0.2})`,
            }}
            animate={{ y: [0, -20, 0], opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: Math.random() * 4 + 3, delay: Math.random() * 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      <motion.div className="w-full max-w-md z-10" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
        <div className="duty-card space-y-6 p-8">
          <div className="text-center space-y-3">
            <div
              className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'hsl(38 100% 56% / 0.1)', boxShadow: '0 0 40px hsl(38 100% 56% / 0.15)' }}
            >
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">SKV Prefect Duty</h2>
              <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" />
                {isSetup ? 'Create the first administrator account' : 'Sign in to continue'}
              </p>
              {isSetup && (
                <p className="text-xs text-muted-foreground text-center max-w-sm mx-auto mt-3 leading-relaxed">
                  {isSupabaseConfigured() ? (
                    <>
                      If your team already uses this app, you should <strong className="text-foreground font-medium">sign in</strong> with an existing username—not create another first admin. Seeing this on a new browser usually means accounts are not syncing: check that this site uses the same Supabase project (<code className="text-[11px] bg-muted px-1 rounded">VITE_SUPABASE_*</code>) and that the <code className="text-[11px] bg-muted px-1 rounded">app_accounts</code> table exists.
                    </>
                  ) : (
                    <>
                      <strong className="text-foreground font-medium">Login is only saved in this browser.</strong> Other browsers will ask for a new admin until you add Supabase URL and key in <code className="text-[11px] bg-muted px-1 rounded">.env</code> and redeploy.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="h-12 pl-10 bg-muted/50 border-border/50"
                  placeholder="Your username"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
              <Input
                type="password"
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="h-12 bg-muted/50 border-border/50"
                placeholder={isSetup ? 'At least 8 characters' : 'Password'}
              />
            </div>
            {isSetup && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confirm password</label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="h-12 bg-muted/50 border-border/50"
                  placeholder="Repeat password"
                />
              </div>
            )}
            <Button className="w-full h-12 text-sm font-semibold" onClick={handleSubmit} disabled={loading}>
              <KeyRound className="h-4 w-4 mr-2" />
              {loading ? 'Please wait…' : isSetup ? 'Create admin & sign in' : 'Sign in'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
