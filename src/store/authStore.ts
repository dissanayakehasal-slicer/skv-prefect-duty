import { create } from 'zustand';
import type { AuthSession, StoredAccount, UserRole } from '@/types/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { generateId } from '@/types/prefect';
import { useVercelPostgresBackend, setApiJwt, getApiJwt } from '@/lib/backendEnv';
import { backendRpc } from '@/lib/backendRpc';

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

let hydratePromise: Promise<void> | null = null;

interface AuthState {
  session: AuthSession | null;
  authHydrated: boolean;
  authMode: AuthMode;
  cloudAccountsExist: boolean | null;
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
  cloudAccountsExist: null,
  remoteAccounts: null,

  hasAnyAccount: () => {
    if (!get().authHydrated) return false;
    if (get().cloudAccountsExist === true) return true;
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
      try {
        const data = await backendRpc<{ token: string; user: AuthSession }>('auth_bootstrap', {
          username: u,
          password,
          id,
        });
        setApiJwt(data.token);
        const session: AuthSession = {
          userId: data.user.userId,
          username: data.user.username,
          role: data.user.role,
        };
        writeSession(session);
        set({
          session,
          remoteAccounts: [{ id, username: u, passwordHash: '', role: 'admin' }],
          cloudAccountsExist: true,
        });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not create account';
      }
    }

    const session: AuthSession = { userId: id, username: u, role: 'admin' };
    writeSession(session);
    set({ session });
    return null;
  },

  login: async (username, password) => {
    const u = normalizeUsername(username);

    if (useVercelPostgresBackend() && get().authMode === 'remote') {
      try {
        const data = await backendRpc<{ token: string; user: AuthSession }>('auth_login', { username: u, password });
        setApiJwt(data.token);
        const session: AuthSession = {
          userId: data.user.userId,
          username: data.user.username,
          role: data.user.role,
        };
        writeSession(session);
        let remote: StoredAccount[] = [];
        if (session.role === 'admin') {
          const listed = await backendRpc<{ accounts: { id: string; username: string; role: UserRole }[] }>(
            'auth_accounts_list',
            {},
            data.token,
          );
          remote = listed.accounts.map((a) => ({
            id: a.id,
            username: a.username,
            passwordHash: '',
            role: a.role,
          }));
        }
        set({ session, remoteAccounts: remote, cloudAccountsExist: true });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Login failed';
      }
    }

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
    setApiJwt(null);
    writeSession(null);
    set({ session: null });
  },

  changePassword: async (currentPassword, newPassword) => {
    const sess = get().session;
    if (!sess) return 'Not signed in';
    if (newPassword.length < 8) return 'New password must be at least 8 characters';

    if (useVercelPostgresBackend() && get().authMode === 'remote') {
      try {
        await backendRpc('auth_password_change', { currentPassword, newPassword });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not update password';
      }
    }

    const accounts = getAccounts(get());
    const idx = accounts.findIndex((a) => a.id === sess.userId);
    if (idx < 0) return 'Account not found';
    const ok = await verifyPassword(currentPassword, accounts[idx].passwordHash);
    if (!ok) return 'Current password is incorrect';
    const newHash = await hashPassword(newPassword);
    const nextAcc = { ...accounts[idx], passwordHash: newHash };

    const next = [...accounts];
    next[idx] = nextAcc;
    saveAccountsRaw(next);
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
    const newAcc: StoredAccount = { id, username: u, passwordHash: await hashPassword(password), role };

    if (get().authMode === 'local') {
      accounts.push(newAcc);
      saveAccountsRaw(accounts);
    } else {
      try {
        await backendRpc('auth_account_add', { username: u, password, role, id });
        set({ remoteAccounts: [...accounts, { id, username: u, passwordHash: '', role }] });
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not create account';
      }
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
      try {
        await backendRpc('auth_account_remove', { userId });
        set({ remoteAccounts: accounts.filter((a) => a.id !== userId) });
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not remove account';
      }
    }

    if (get().session?.userId === userId) {
      writeSession(null);
      setApiJwt(null);
      set({ session: null });
    }
    return null;
  },

  isAdmin: () => get().session?.role === 'admin',
}));

export function hydrateAuthSession() {
  const s = readSession();
  if (s) useAuthStore.setState({ session: s });
}

/** Load session from Vercel API when enabled; otherwise local browser accounts only. */
export async function hydrateAuth(): Promise<void> {
  hydrateAuthSession();

  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    if (!useVercelPostgresBackend()) {
      useAuthStore.setState({ authHydrated: true, authMode: 'local', remoteAccounts: null, cloudAccountsExist: null });
      return;
    }

    try {
      const { has_accounts } = await backendRpc<{ has_accounts: boolean }>('auth_public_config');
      const token = getApiJwt();
      if (token) {
        try {
          const me = await backendRpc<{ userId: string; username: string; role: UserRole }>('auth_me', {}, token);
          const session: AuthSession = {
            userId: me.userId,
            username: me.username,
            role: me.role,
          };
          writeSession(session);
          let remote: StoredAccount[] = [];
          if (me.role === 'admin') {
            const listed = await backendRpc<{ accounts: { id: string; username: string; role: UserRole }[] }>(
              'auth_accounts_list',
              {},
              token,
            );
            remote = listed.accounts.map((a) => ({
              id: a.id,
              username: a.username,
              passwordHash: '',
              role: a.role,
            }));
          }
          useAuthStore.setState({
            session,
            authHydrated: true,
            authMode: 'remote',
            remoteAccounts: remote,
            cloudAccountsExist: has_accounts,
          });
        } catch {
          setApiJwt(null);
          writeSession(null);
          useAuthStore.setState({
            session: null,
            authHydrated: true,
            authMode: 'remote',
            remoteAccounts: [],
            cloudAccountsExist: has_accounts,
          });
        }
      } else {
        useAuthStore.setState({
          authHydrated: true,
          authMode: 'remote',
          remoteAccounts: [],
          cloudAccountsExist: has_accounts,
        });
      }
    } catch (e) {
      console.warn('API unavailable, using local auth', e);
      useAuthStore.setState({
        authHydrated: true,
        authMode: 'local',
        remoteAccounts: null,
        cloudAccountsExist: null,
      });
    }
  })();

  await hydratePromise;
}
