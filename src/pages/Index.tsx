import { useState, useEffect } from 'react';
import { PrefectsTab } from '@/components/PrefectsTab';
import { SectionsTab } from '@/components/SectionsTab';
import { AssignmentsTab } from '@/components/AssignmentsTab';
import { ValidationPanel } from '@/components/ValidationPanel';
import { exportPDF } from '@/utils/exportPdf';
import { Button } from '@/components/ui/button';
import { usePrefectStore } from '@/store/prefectStore';
import { FileDown, Users, MapPin, ClipboardList, ShieldCheck } from 'lucide-react';

const TABS = [
  { id: 'prefects', label: 'Prefects', icon: Users },
  { id: 'sections', label: 'Sections & Duty Places', icon: MapPin },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'validation', label: 'Validation', icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]['id'];

const Index = () => {
  const [activeTab, setActiveTab] = useState<TabId>('prefects');
  const { prefects, assignments, validate, loadFromDB, loading, initialized } = usePrefectStore();
  const issues = validate();
  const errorCount = issues.filter((i) => i.type === 'error').length;

  useEffect(() => {
    if (!initialized) loadFromDB();
  }, [initialized, loadFromDB]);

  if (loading && !initialized) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-primary">Prefect Duty System</h1>
            <p className="text-sm text-muted-foreground">{prefects.length} prefects · {assignments.length} assignments</p>
          </div>
          <Button onClick={exportPDF} size="sm" className="bg-primary">
            <FileDown className="h-4 w-4 mr-1.5" /> Export PDF
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4">
          <nav className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.id === 'validation' && errorCount > 0 && (
                    <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs">{errorCount}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {activeTab === 'prefects' && <PrefectsTab />}
        {activeTab === 'sections' && <SectionsTab />}
        {activeTab === 'assignments' && <AssignmentsTab />}
        {activeTab === 'validation' && <ValidationPanel />}
      </main>
    </div>
  );
};

export default Index;
