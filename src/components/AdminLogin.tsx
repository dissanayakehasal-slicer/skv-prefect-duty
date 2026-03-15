import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border bg-card shadow-lg">
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Admin Login</h2>
          <p className="text-sm text-muted-foreground">Prefect Duty System</p>
        </div>

        {!requireChange ? (
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              <KeyRound className="h-4 w-4 mr-2" />
              {loading ? 'Verifying...' : 'Login'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-amber-600 font-medium">Please set a new password:</p>
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
            />
            <Button className="w-full" onClick={handleChangePassword} disabled={loading}>
              {loading ? 'Changing...' : 'Set New Password & Login'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
