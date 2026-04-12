import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrefectsTab } from '@/components/PrefectsTab';
import { SectionsTab } from '@/components/SectionsTab';
import { AssignmentsTab } from '@/components/AssignmentsTab';
import { StandingsTab } from '@/components/StandingsTab';
import { ValidationPanel } from '@/components/ValidationPanel';
import { SettingsTab } from '@/components/SettingsTab';
import { LoginPage } from '@/components/LoginPage';
import { ScreenSaver } from '@/components/ScreenSaver';
import { exportPDF } from '@/utils/exportPdf';
import { Button } from '@/components/ui/button';
import { usePrefectStore } from '@/store/prefectStore';
import { useAuthStore, hydrateAuth } from '@/store/authStore';
import { FileDown, Users, MapPin, ClipboardList, ShieldCheck, Shield, LogOut, Trophy, Settings, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { isSupabaseConfigured } from '@/lib/supabaseEnv';
import { useShallow } from 'zustand/react/shallow';

const ADMIN_TABS = [
  { id: 'prefects', label: 'Prefects', icon: Users },
  { id: 'sections', label: 'Sections', icon: MapPin },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

const DUTY_EDITOR_TABS = [
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'sections', label: 'Sections', icon: MapPin },
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

/** Same tabs as admin but all screens are read-only in the UI */
const VIEWER_TABS = ADMIN_TABS;

type TabId = typeof ADMIN_TABS[number]['id'];

const SCREENSAVER_TIMEOUT = 3 * 60 * 1000;

const Index = () => {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = session?.role === 'admin';
  const isViewer = session?.role === 'viewer';

  const tabs = useMemo(() => {
    if (session?.role === 'admin') return ADMIN_TABS;
    if (session?.role === 'viewer') return VIEWER_TABS;
    return DUTY_EDITOR_TABS;
  }, [session?.role]);

  const [activeTab, setActiveTab] = useState<TabId>('prefects');
  const [screenSaverActive, setScreenSaverActive] = useState(false);

  useEffect(() => {
    void hydrateAuth();
  }, []);

  useEffect(() => {
    if (!session) return;
    const allowed = tabs.map((t) => t.id);
    if (!allowed.includes(activeTab)) {
      const fallback: TabId =
        session.role === 'duty_editor' ? 'assignments' : 'prefects';
      setActiveTab(fallback);
    }
  }, [session, tabs, activeTab]);

  const authMode = useAuthStore((s) => s.authMode);
  const { prefects, sections, dutyPlaces, assignments, loadFromDB, loading, initialized } = usePrefectStore(useShallow((state) => ({
    prefects: state.prefects,
    sections: state.sections,
    dutyPlaces: state.dutyPlaces,
    assignments: state.assignments,
    loadFromDB: state.loadFromDB,
    loading: state.loading,
    initialized: state.initialized,
  })));
  const issues = useMemo(() => usePrefectStore.getState().validate(), [prefects, sections, dutyPlaces, assignments]);
  const errorCount = issues.filter((i) => i.type === 'error').length;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const showEmptyDatabaseHint =
    initialized &&
    !loading &&
    prefects.length === 0 &&
    dutyPlaces.length === 0 &&
    sections.length === 0;

  const authenticated = !!session;

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setScreenSaverActive(false);
    timerRef.current = setTimeout(() => setScreenSaverActive(true), SCREENSAVER_TIMEOUT);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    resetTimer();
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [authenticated, resetTimer]);

  useEffect(() => {
    if (authenticated && !initialized) loadFromDB();
  }, [authenticated, initialized, loadFromDB]);

  if (!session) {
    return <LoginPage />;
  }

  if (loading && !initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(38 100% 56% / 0.1)' }}
          >
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm">Loading system data...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      <ScreenSaver active={screenSaverActive} onDismiss={() => setScreenSaverActive(false)} />
      <div className="min-h-screen bg-background relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle at 30% 30%, hsl(38 92% 58% / 0.18), transparent 60%)', filter: 'blur(8px)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-56 -right-56 h-[620px] w-[620px] rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 40%, hsl(210 80% 55% / 0.14), transparent 62%)', filter: 'blur(10px)' }}
        />

        <header
          className="border-b border-border/50 sticky top-0 z-40"
          style={{ background: 'hsl(var(--background) / 0.7)', backdropFilter: 'blur(18px)' }}
        >
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center gold-glow" style={{ background: 'hsl(38 100% 56% / 0.1)' }}>
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground">SKV PREFECT DUTY</h1>
                <p className="text-xs text-muted-foreground">
                  {session.username}
                  <span className="mx-1">·</span>
                  <span className="capitalize">{session.role.replace('_', ' ')}</span>
                  <span className="mx-1">·</span>
                  {prefects.length} prefects · {assignments.length} assignments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isViewer && (
              <Button onClick={exportPDF} size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                <FileDown className="h-4 w-4 mr-1.5" /> Export PDF
              </Button>
              )}
              <Button onClick={handleLogout} size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div
          className="border-b border-border/30"
          style={{ background: 'hsl(var(--background) / 0.45)' }}
        >
          <div className="container mx-auto px-6">
            <nav className="flex gap-1 flex-wrap">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.id === 'validation' && errorCount > 0 && (
                      <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs px-1">
                        {errorCount}
                      </span>
                    )}
                    {isActive && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                        style={{ background: 'hsl(38 100% 56%)' }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <main className="container mx-auto px-6 py-8">
          {showEmptyDatabaseHint && (
            <Alert className="mb-6 border-primary/25 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>No prefects or duty places in this database</AlertTitle>
              <AlertDescription className="text-muted-foreground space-y-2">
                <p>
                  If you already built your list on another browser or computer, that usually means either this session is using an <strong className="text-foreground">empty cloud database</strong>, or data never left the other device.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  <li>
                    <strong className="text-foreground">Same data everywhere:</strong> use the same Supabase project in{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>, run SQL migrations, and sign in with accounts from the <code className="rounded bg-muted px-1 py-0.5 text-xs">app_accounts</code> table—not a new “first admin” on each browser.
                  </li>
                  <li>
                    {!isSupabaseConfigured() ? (
                      <>Supabase env vars are missing in this build, so duty data falls back to browser storage on each device separately.</>
                    ) : authMode === 'local' ? (
                      <>Login accounts are using browser storage on this device (could not load cloud accounts). Duty data may also be an offline copy.</>
                    ) : (
                      <>This Supabase project may have no rows yet in <code className="rounded bg-muted px-1 py-0.5 text-xs">prefects</code> / <code className="rounded bg-muted px-1 py-0.5 text-xs">duty_places</code>—confirm in the Supabase Table Editor.</>
                    )}
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {activeTab === 'prefects' && (isAdmin || isViewer) && (
            <PrefectsTab canManagePrefects={isAdmin} />
          )}
          {activeTab === 'sections' && (
            <SectionsTab canManageStructure={isAdmin} canEditDutyContent={!isViewer} />
          )}
          {activeTab === 'assignments' && <AssignmentsTab readOnly={isViewer} />}
          {activeTab === 'standings' && (
            <StandingsTab canEditStandings={isAdmin} />
          )}
          {activeTab === 'validation' && <ValidationPanel readOnly={isViewer} />}
          {activeTab === 'settings' && <SettingsTab />}
        </main>
      </div>
    </>
  );
};

export default Index;
