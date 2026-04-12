import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { KeyRound, UserPlus, Trash2, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function SettingsTab() {
  const session = useAuthStore((s) => s.session);
  const changePassword = useAuthStore((s) => s.changePassword);
  const listAccounts = useAuthStore((s) => s.listAccounts);
  const addAccount = useAuthStore((s) => s.addAccount);
  const removeAccount = useAuthStore((s) => s.removeAccount);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loadingPw, setLoadingPw] = useState(false);

  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'duty_editor' as UserRole });
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const accounts = useMemo(() => {
    void tick;
    return listAccounts();
  }, [listAccounts, tick]);

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error('New passwords do not match');
      return;
    }
    setLoadingPw(true);
    try {
      const err = await changePassword(currentPw, newPw);
      if (err) toast.error(err);
      else {
        toast.success('Password updated');
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } finally {
      setLoadingPw(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username.trim() || !newUser.password) {
      toast.error('Username and password required');
      return;
    }
    setCreating(true);
    try {
      const err = await addAccount(newUser.username, newUser.password, newUser.role);
      if (err) toast.error(err);
      else {
        toast.success('Account created');
        setNewUser({ username: '', password: '', role: 'duty_editor' });
        setTick((t) => t + 1);
      }
    } finally {
      setCreating(false);
    }
  };

  const confirmRemove = async () => {
    if (!deleteId) return;
    const err = await removeAccount(deleteId);
    if (err) toast.error(err);
    else {
      toast.success('Account removed');
      setTick((t) => t + 1);
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Signed in as <span className="text-foreground font-medium">{session?.username}</span>
          {' · '}
          <span className="capitalize">{session?.role?.replace('_', ' ')}</span>
        </p>
      </div>

      <div className="duty-card space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Change your password</h3>
        </div>
        <Input
          type="password"
          placeholder="Current password"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
          className="bg-muted/30"
          autoComplete="current-password"
        />
        <Input
          type="password"
          placeholder="New password (min 8 characters)"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          className="bg-muted/30"
          autoComplete="new-password"
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          className="bg-muted/30"
          autoComplete="new-password"
        />
        <Button size="sm" onClick={handleChangePassword} disabled={loadingPw}>
          {loadingPw ? 'Updating…' : 'Update password'}
        </Button>
      </div>

      {isAdmin && (
        <div className="duty-card space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">Accounts (admin only)</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Only administrators can create or remove accounts. Duty editors can manage assignments and edit existing duty places, but cannot add or remove prefects or duty places.
          </p>

          <div className="rounded-lg border border-border/40 divide-y divide-border/40">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-foreground">{a.username}</span>
                  <span className="text-muted-foreground ml-2 capitalize">({a.role === 'viewer' ? 'viewer' : a.role.replace('_', ' ')})</span>
                </div>
                {a.id !== session?.userId && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setDeleteId(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {accounts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No accounts</p>}
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <UserPlus className="h-4 w-4" /> New account
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="bg-muted/30"
                autoComplete="off"
              />
              <Input
                type="password"
                placeholder="Password (min 8)"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="bg-muted/30"
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as UserRole })}>
                <SelectTrigger className="w-full sm:w-48 bg-muted/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="duty_editor">Duty editor</SelectItem>
                  <SelectItem value="viewer">Viewer (read-only)</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleCreateUser} disabled={creating}>
                {creating ? 'Creating…' : 'Create account'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to sign in. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
