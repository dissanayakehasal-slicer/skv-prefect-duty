import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, KeyRound, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface AdminLoginProps {
  onAuthenticated: () => void;
}

export function AdminLogin({ onAuthenticated }: AdminLoginProps) {
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireChange, setRequireChange] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: { action: 'verify', password },
      });
      if (error || !data?.success) {
        toast.error(data?.error || 'Invalid password');
        return;
      }
      if (data.requirePasswordChange) {
        setRequireChange(true);
        toast.info('You must change your password on first login');
      } else {
        sessionStorage.setItem('admin_authenticated', 'true');
        onAuthenticated();
      }
    } catch (err) {
      toast.error('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth', {
        body: { action: 'change_password', password, newPassword },
      });
      if (error || !data?.success) {
        toast.error(data?.error || 'Failed to change password');
        return;
      }
      toast.success('Password changed successfully');
      sessionStorage.setItem('admin_authenticated', 'true');
      onAuthenticated();
    } catch (err) {
      toast.error('Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background ambient effects */}
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
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: Math.random() * 4 + 3,
              delay: Math.random() * 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <motion.div
        className="w-full max-w-md z-10"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="duty-card space-y-8 p-8">
          <motion.div
            className="text-center space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              className="mx-auto h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'hsl(38 100% 56% / 0.1)', boxShadow: '0 0 40px hsl(38 100% 56% / 0.15)' }}
              animate={{ boxShadow: ['0 0 40px hsl(38 100% 56% / 0.15)', '0 0 60px hsl(38 100% 56% / 0.25)', '0 0 40px hsl(38 100% 56% / 0.15)'] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Shield className="h-8 w-8 text-primary" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">Prefect Duty System</h2>
              <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                <Sparkles className="h-3 w-3 text-primary" /> Administrative Access
              </p>
            </div>
          </motion.div>

          {!requireChange ? (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="h-12 bg-muted/50 border-border/50 focus:border-primary/50 transition-colors"
                />
              </div>
              <Button className="w-full h-12 text-sm font-semibold" onClick={handleLogin} disabled={loading}>
                <KeyRound className="h-4 w-4 mr-2" />
                {loading ? 'Verifying...' : 'Authenticate'}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-sm text-primary font-medium">Set a new password to continue:</p>
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-12 bg-muted/50 border-border/50"
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                className="h-12 bg-muted/50 border-border/50"
              />
              <Button className="w-full h-12" onClick={handleChangePassword} disabled={loading}>
                {loading ? 'Changing...' : 'Set Password & Continue'}
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
