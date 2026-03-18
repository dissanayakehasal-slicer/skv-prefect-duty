import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PrefectsTab } from '@/components/PrefectsTab';
import { SectionsTab } from '@/components/SectionsTab';
import { AssignmentsTab } from '@/components/AssignmentsTab';
import { StandingsTab } from '@/components/StandingsTab';
import { ValidationPanel } from '@/components/ValidationPanel';
import { AdminLogin } from '@/components/AdminLogin';
import { ScreenSaver } from '@/components/ScreenSaver';
import { exportPDF } from '@/utils/exportPdf';
import { Button } from '@/components/ui/button';
import { usePrefectStore } from '@/store/prefectStore';
import { FileDown, Users, MapPin, ClipboardList, ShieldCheck, Shield, LogOut, Trophy } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

const TABS = [
  { id: 'prefects', label: 'Prefects', icon: Users },
  { id: 'sections', label: 'Sections', icon: MapPin },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'standings', label: 'Standings', icon: Trophy },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]['id'];

const SCREENSAVER_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('prefects');
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('admin_authenticated') === 'true');
  const [screenSaverActive, setScreenSaverActive] = useState(false);
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

  if (!authenticated) {
    return <AdminLogin onAuthenticated={() => setAuthenticated(true)} />;
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
    sessionStorage.removeItem('admin_authenticated');
    setAuthenticated(false);
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
                <h1 className="text-lg font-bold tracking-tight text-foreground">Prefect Duty System</h1>
                <p className="text-xs text-muted-foreground">
                  {prefects.length} prefects · {assignments.length} assignments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={exportPDF} size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
                <FileDown className="h-4 w-4 mr-1.5" /> Export PDF
              </Button>
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
            <nav className="flex gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
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
          {activeTab === 'prefects' && <PrefectsTab />}
          {activeTab === 'sections' && <SectionsTab />}
          {activeTab === 'assignments' && <AssignmentsTab />}
          {activeTab === 'standings' && <StandingsTab />}
          {activeTab === 'validation' && <ValidationPanel />}
        </main>
      </div>
    </>
  );
};

export default Index;
