import { create } from 'zustand';
import type { AuthSession, StoredAccount, UserRole } from '@/types/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { generateId } from '@/types/prefect';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabaseEnv';

const ACCOUNTS_KEY = 'skv_auth_accounts_v1';
const SESSION_KEY = 'skv_auth_session_v1';

type AuthMode = 'remote' | 'local';

function loadAccountsRaw(): StoredAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccountsRaw(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

function readSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (s?.userId && s?.username && (s.role === 'admin' || s.role === 'duty_editor' || s.role === 'viewer')) return s;
  } catch {
    /* ignore */
  }
  return null;
}

function writeSession(s: AuthSession | null) {
  if (!s) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function isUserRole(r: string): r is UserRole {
  return r === 'admin' || r === 'duty_editor' || r === 'viewer';
}

function rowToAccount(row: { id: string; username: string; password_hash: string; role: string }): StoredAccount | null {
  if (!isUserRole(row.role)) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
  };
}

let hydratePromise: Promise<void> | null = null;

interface AuthState {
  session: AuthSession | null;
  authHydrated: boolean;
  authMode: AuthMode;
  /** When authMode is remote, mirrors DB rows (including hashes) for login/account ops */
  remoteAccounts: StoredAccount[] | null;

  hasAnyAccount: () => boolean;
  bootstrapFirstAdmin: (username: string, password: string) => Promise<string | null>;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;

  listAccounts: () => { id: string; username: string; role: UserRole }[];
  addAccount: (username: string, password: string, role: UserRole) => Promise<string | null>;
  removeAccount: (userId: string) => Promise<string | null>;
  isAdmin: () => boolean;
}

function getAccounts(state: AuthState): StoredAccount[] {
  if (state.authMode === 'local') return loadAccountsRaw();
  return state.remoteAccounts ?? [];
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: readSession(),
  authHydrated: false,
  authMode: 'local',
  remoteAccounts: null,

  hasAnyAccount: () => {
    if (!get().authHydrated) return false;
    return getAccounts(get()).length > 0;
  },

  bootstrapFirstAdmin: async (username, password) => {
    const u = normalizeUsername(username);
    if (u.length < 2) return 'Username must be at least 2 characters';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (getAccounts(get()).length > 0) return 'An account already exists';

    const id = generateId();
    const passwordHash = await hashPassword(password);
    const account: StoredAccount = { id, username: u, passwordHash, role: 'admin' };

    if (get().authMode === 'local') {
      saveAccountsRaw([account]);
    } else {
      const { error } = await supabase.from('app_accounts').insert({
        id: account.id,
        username: account.username,
        password_hash: account.passwordHash,
        role: account.role,
      });
      if (error) {
        console.error(error);
        return error.message || 'Could not save account to database';
      }
      set({ remoteAccounts: [account] });
    }

    const session: AuthSession = { userId: id, username: u, role: 'admin' };
    writeSession(session);
    set({ session });
    return null;
  },

  login: async (username, password) => {
    const u = normalizeUsername(username);
    const accounts = getAccounts(get());
    const acc = accounts.find((a) => a.username === u);
    if (!acc) return 'Invalid username or password';
    const ok = await verifyPassword(password, acc.passwordHash);
    if (!ok) return 'Invalid username or password';
    const session: AuthSession = { userId: acc.id, username: acc.username, role: acc.role };
    writeSession(session);
    set({ session });
    return null;
  },

  logout: () => {
    writeSession(null);
    set({ session: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    const sess = get().session;
    if (!sess) return 'Not signed in';
    if (newPassword.length < 8) return 'New password must be at least 8 characters';
    const accounts = getAccounts(get());
    const idx = accounts.findIndex((a) => a.id === sess.userId);
    if (idx < 0) return 'Account not found';
    const ok = await verifyPassword(currentPassword, accounts[idx].passwordHash);
    if (!ok) return 'Current password is incorrect';
    const newHash = await hashPassword(newPassword);
    const nextAcc = { ...accounts[idx], passwordHash: newHash };

    if (get().authMode === 'local') {
      const next = [...accounts];
      next[idx] = nextAcc;
      saveAccountsRaw(next);
    } else {
      const { error } = await supabase
        .from('app_accounts')
        .update({ password_hash: newHash })
        .eq('id', sess.userId);
      if (error) {
        console.error(error);
        return error.message || 'Could not update password';
      }
      const next = [...accounts];
      next[idx] = nextAcc;
      set({ remoteAccounts: next });
    }
    return null;
  },

  listAccounts: () => getAccounts(get()).map((a) => ({ id: a.id, username: a.username, role: a.role })),

  addAccount: async (username, password, role) => {
    if (get().session?.role !== 'admin') return 'Only admins can manage accounts';
    const u = normalizeUsername(username);
    if (u.length < 2) return 'Username must be at least 2 characters';
    if (password.length < 8) return 'Password must be at least 8 characters';
    const accounts = getAccounts(get());
    if (accounts.some((a) => a.username === u)) return 'Username already exists';
    const id = generateId();
    const passwordHash = await hashPassword(password);
    const newAcc: StoredAccount = { id, username: u, passwordHash, role };

    if (get().authMode === 'local') {
      accounts.push(newAcc);
      saveAccountsRaw(accounts);
    } else {
      const { error } = await supabase.from('app_accounts').insert({
        id: newAcc.id,
        username: newAcc.username,
        password_hash: newAcc.passwordHash,
        role: newAcc.role,
      });
      if (error) {
        console.error(error);
        return error.message || 'Could not create account';
      }
      set({ remoteAccounts: [...accounts, newAcc] });
    }
    return null;
  },

  removeAccount: async (userId) => {
    if (get().session?.role !== 'admin') return 'Only admins can remove accounts';
    const accounts = getAccounts(get());
    const target = accounts.find((a) => a.id === userId);
    if (!target) return 'User not found';
    if (target.role === 'admin') {
      const adminCount = accounts.filter((a) => a.role === 'admin').length;
      if (adminCount <= 1) return 'Cannot remove the last admin';
    }

    if (get().authMode === 'local') {
      const next = accounts.filter((a) => a.id !== userId);
      saveAccountsRaw(next);
    } else {
      const { error } = await supabase.from('app_accounts').delete().eq('id', userId);
      if (error) {
        console.error(error);
        return error.message || 'Could not remove account';
      }
      set({ remoteAccounts: accounts.filter((a) => a.id !== userId) });
    }

    if (get().session?.userId === userId) {
      writeSession(null);
      set({ session: null });
    }
    return null;
  },

  isAdmin: () => get().session?.role === 'admin',
}));

async function fetchRemoteAccounts(): Promise<StoredAccount[]> {
  const { data, error } = await supabase.from('app_accounts').select('*');
  if (error) throw error;
  const out: StoredAccount[] = [];
  for (const row of data || []) {
    const acc = rowToAccount(row);
    if (acc) out.push(acc);
  }
  return out;
}

async function migrateLocalAccountsToRemote(): Promise<void> {
  const local = loadAccountsRaw();
  if (local.length === 0) return;
  const rows = local.map((a) => ({
    id: a.id,
    username: a.username,
    password_hash: a.passwordHash,
    role: a.role,
  }));
  const { error } = await supabase.from('app_accounts').insert(rows);
  if (error) {
    console.warn('Could not migrate local accounts to Supabase:', error);
    throw error;
  }
}

export function hydrateAuthSession() {
  const s = readSession();
  if (s) useAuthStore.setState({ session: s });
}

/**
 * Load session from sessionStorage and sync login accounts from Supabase when configured.
 * Falls back to browser localStorage for accounts if the database is unreachable.
 */
export async function hydrateAuth(): Promise<void> {
  hydrateAuthSession();

  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    if (!isSupabaseConfigured()) {
      useAuthStore.setState({ authHydrated: true, authMode: 'local', remoteAccounts: null });
      return;
    }

    try {
      let remote = await fetchRemoteAccounts();

      if (remote.length === 0) {
        const local = loadAccountsRaw();
        if (local.length > 0) {
          try {
            await migrateLocalAccountsToRemote();
            remote = await fetchRemoteAccounts();
          } catch {
            useAuthStore.setState({ authHydrated: true, authMode: 'local', remoteAccounts: null });
            return;
          }
        }
      }

      useAuthStore.setState({
        authHydrated: true,
        authMode: 'remote',
        remoteAccounts: remote,
      });
    } catch (e) {
      console.warn('App accounts: using local storage (database unavailable)', e);
      useAuthStore.setState({ authHydrated: true, authMode: 'local', remoteAccounts: null });
    }
  })();

  await hydratePromise;
}
