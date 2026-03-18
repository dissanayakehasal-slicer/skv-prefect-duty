import { useState, useEffect, useRef, useCallback } from 'react';
import { PrefectsTab } from '@/components/PrefectsTab';
import { SectionsTab } from '@/components/SectionsTab';
import { AssignmentsTab } from '@/components/AssignmentsTab';
import { ValidationPanel } from '@/components/ValidationPanel';
import { AdminLogin } from '@/components/AdminLogin';
import { ScreenSaver } from '@/components/ScreenSaver';
import { exportPDF } from '@/utils/exportPdf';
import { Button } from '@/components/ui/button';
import { usePrefectStore } from '@/store/prefectStore';
import { FileDown, Users, MapPin, ClipboardList, ShieldCheck, Shield, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TABS = [
  { id: 'prefects', label: 'Prefects', icon: Users },
  { id: 'sections', label: 'Sections', icon: MapPin },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]['id'];

const SCREENSAVER_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('prefects');
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem('admin_authenticated') === 'true');
  const [screenSaverActive, setScreenSaverActive] = useState(false);
  const { prefects, assignments, validate, loadFromDB, loading, initialized } = usePrefectStore();
  const issues = validate();
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
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ background: 'hsl(38 100% 56% / 0.1)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Shield className="h-6 w-6 text-primary" />
          </motion.div>
          <p className="text-muted-foreground text-sm">Loading system data...</p>
        </motion.div>
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
      <div className="min-h-screen bg-background">
        {/* Header */}
        <motion.header
          className="border-b border-border/50 sticky top-0 z-40"
          style={{ background: 'hsl(225 25% 7% / 0.8)', backdropFilter: 'blur(16px)' }}
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
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
        </motion.header>

        {/* Tabs */}
        <motion.div
          className="border-b border-border/30"
          style={{ background: 'hsl(225 25% 7% / 0.5)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="container mx-auto px-6">
            <nav className="flex gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                      isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    whileHover={{ y: -1 }}
                    whileTap={{ y: 0 }}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                    {tab.id === 'validation' && errorCount > 0 && (
                      <motion.span
                        className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs px-1"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring' }}
                      >
                        {errorCount}
                      </motion.span>
                    )}
                    {isActive && (
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                        style={{ background: 'hsl(38 100% 56%)' }}
                        layoutId="activeTab"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </nav>
          </div>
        </motion.div>

        {/* Content */}
        <main className="container mx-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {activeTab === 'prefects' && <PrefectsTab />}
              {activeTab === 'sections' && <SectionsTab />}
              {activeTab === 'assignments' && <AssignmentsTab />}
              {activeTab === 'validation' && <ValidationPanel />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
};

export default Index;
