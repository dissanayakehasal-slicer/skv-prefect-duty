import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, MapPin, Pencil, Check, X, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'framer-motion';

export function SectionsTab() {
  const {
    sections, dutyPlaces, prefects,
    addSection, removeSection, renameSection,
    setSectionHead, setSectionCoHead,
    addDutyPlace, removeDutyPlace, updateDutyPlace, importDutyPlaces,
    isSectionHeadOrCoHead, getPrefectDuty,
  } = usePrefectStore();

  const [newSectionName, setNewSectionName] = useState('');
  const [newDpForm, setNewDpForm] = useState({ name: '', sectionId: '', isSpecial: false, isMandatory: false, requiredGenderBalance: false, minPrefects: 1, maxPrefects: 2 });
  const [showAddDp, setShowAddDp] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [editingDpId, setEditingDpId] = useState<string | null>(null);
  const [editingDpForm, setEditingDpForm] = useState<Record<string, any>>({});

  const getEligibleHeads = (sectionId: string, gender?: 'Male' | 'Female') => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return [];
    const sectionGradeMatch = section.name.match(/GRADE (\d+)/);
    const sectionGrade = sectionGradeMatch ? parseInt(sectionGradeMatch[1]) : 0;
    return prefects.filter((p) => {
      if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
      if (gender && p.gender !== gender) return false;
      if (section.headId === p.id || section.coHeadId === p.id) return true;
      const hasDuty = getPrefectDuty(p.id);
      const isLeaderElsewhere = sections.some((s) => s.id !== sectionId && (s.headId === p.id || s.coHeadId === p.id));
      if (hasDuty || isLeaderElsewhere) return false;
      if (sectionGrade > 0) {
        if (p.grade === 11 && (sectionGrade === 10 || sectionGrade === 11)) return true;
        return p.grade >= sectionGrade + 2;
      }
      return p.grade >= 8;
    });
  };

  const startEditDp = (dp: any) => {
    setEditingDpId(dp.id);
    setEditingDpForm({ name: dp.name, isSpecial: dp.isSpecial || false, isMandatory: dp.isMandatory || false, requiredGenderBalance: dp.requiredGenderBalance || false, minPrefects: dp.minPrefects ?? 1, maxPrefects: dp.maxPrefects || 1, sectionId: dp.sectionId || '' });
  };

  const saveEditDp = async () => {
    if (!editingDpId) return;
    if ((editingDpForm.minPrefects || 0) > (editingDpForm.maxPrefects || 1)) {
      toast.error('Min cannot exceed max');
      return;
    }
    await updateDutyPlace(editingDpId, editingDpForm);
    setEditingDpId(null);
    toast.success('Duty place updated');
  };

  const handleImportDutyPlaces = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(1).filter(Boolean);
      const parsed = lines.map((line) => {
        const cols = line.split(',').map((s) => s.trim());
        // Expected: Name, SectionId, Special, Mandatory, MinPrefects, MaxPrefects, GenderBalance
        return {
          name: cols[0] || '',
          sectionId: cols[1] || '',
          isSpecial: cols[2]?.toLowerCase() === 'true',
          isMandatory: cols[3]?.toLowerCase() === 'true',
          minPrefects: parseInt(cols[4]) || 0,
          maxPrefects: parseInt(cols[5]) || 1,
          requiredGenderBalance: cols[6]?.toLowerCase() === 'true',
        };
      }).filter((dp) => dp.name);

      if (parsed.length === 0) { toast.error('No valid duty places found'); return; }
      importDutyPlaces(parsed);
      toast.success(`Imported ${parsed.length} duty places`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const csv = ['Name,SectionId,Special,Mandatory,MinPrefects,MaxPrefects,GenderBalance', 'Main Gate,,true,true,2,4,true', '4A,<section-id>,false,true,1,2,false'];
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'duty_places_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const generalDps = dutyPlaces.filter((dp) => !dp.sectionId);

  const renderDpRow = (dp: typeof dutyPlaces[0]) => {
    if (editingDpId === dp.id) {
      return (
        <motion.div key={dp.id} className="grid grid-cols-2 md:grid-cols-8 gap-2 items-center p-3 rounded-lg bg-muted/20 border border-primary/20" layout>
          <Input value={editingDpForm.name} onChange={(e) => setEditingDpForm({ ...editingDpForm, name: e.target.value })} className="h-8 bg-muted/30 text-sm" />
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={editingDpForm.isSpecial} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, isSpecial: !!c })} /> Special</label>
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={editingDpForm.isMandatory} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, isMandatory: !!c })} /> Mandatory</label>
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={editingDpForm.requiredGenderBalance} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, requiredGenderBalance: !!c })} /> Gender Bal.</label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Min</span>
            <Input type="number" min={0} max={10} value={editingDpForm.minPrefects} onChange={(e) => setEditingDpForm({ ...editingDpForm, minPrefects: parseInt(e.target.value) || 0 })} className="h-8 w-14 bg-muted/30 text-sm" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Max</span>
            <Input type="number" min={1} max={10} value={editingDpForm.maxPrefects} onChange={(e) => setEditingDpForm({ ...editingDpForm, maxPrefects: parseInt(e.target.value) || 1 })} className="h-8 w-14 bg-muted/30 text-sm" />
          </div>
          <Select value={editingDpForm.sectionId || '_none'} onValueChange={(v) => setEditingDpForm({ ...editingDpForm, sectionId: v === '_none' ? '' : v })}>
            <SelectTrigger className="h-8 bg-muted/30 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— None —</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={saveEditDp}><Check className="h-3 w-3 text-success" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingDpId(null)}><X className="h-3 w-3" /></Button>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={dp.id}
        className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border/30 hover:border-border/60 transition-colors group"
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <div className="flex items-center gap-3 flex-1">
          <span className="font-medium text-sm text-foreground">{dp.name}</span>
          {dp.isSpecial && <Badge variant="outline" className="text-xs border-primary/30 text-primary">Special</Badge>}
          {dp.isMandatory && <span className="badge-warning text-xs">Required</span>}
          {dp.requiredGenderBalance && <span className="text-xs text-muted-foreground">⚤</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {dp.minPrefects ?? 0} – {dp.maxPrefects || 1} prefects
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditDp(dp)}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { removeDutyPlace(dp.id); toast.success('Removed'); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderAddDpForm = (groupId: string) => {
    if (showAddDp !== groupId) {
      return (
        <Button variant="outline" size="sm" className="border-dashed border-border/50 text-muted-foreground hover:text-foreground" onClick={() => { setShowAddDp(groupId); setNewDpForm({ ...newDpForm, sectionId: groupId === '__general__' ? '' : groupId, name: '' }); }}>
          <Plus className="h-3 w-3 mr-1" /> Add Duty Place
        </Button>
      );
    }

    return (
      <motion.div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end p-3 rounded-lg bg-muted/10 border border-primary/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Input placeholder="Place name" value={newDpForm.name} onChange={(e) => setNewDpForm({ ...newDpForm, name: e.target.value })} className="bg-muted/30 text-sm" />
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={newDpForm.isSpecial} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isSpecial: !!c })} /> Special</label>
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={newDpForm.isMandatory} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isMandatory: !!c })} /> Mandatory</label>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Min</span>
          <Input type="number" min={0} max={10} value={newDpForm.minPrefects} onChange={(e) => setNewDpForm({ ...newDpForm, minPrefects: parseInt(e.target.value) || 0 })} className="w-14 bg-muted/30 text-sm" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Max</span>
          <Input type="number" min={1} max={10} value={newDpForm.maxPrefects} onChange={(e) => setNewDpForm({ ...newDpForm, maxPrefects: parseInt(e.target.value) || 1 })} className="w-14 bg-muted/30 text-sm" />
        </div>
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={newDpForm.requiredGenderBalance} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, requiredGenderBalance: !!c })} /> Gender Bal.</label>
        <div className="flex gap-1">
          <Button size="sm" onClick={() => {
            if (!newDpForm.name) return;
            if (newDpForm.minPrefects > newDpForm.maxPrefects) { toast.error('Min cannot exceed max'); return; }
            addDutyPlace({ ...newDpForm });
            setNewDpForm({ ...newDpForm, name: '' });
            setShowAddDp(null);
            toast.success('Added');
          }}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAddDp(null)}>×</Button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">Sections & Duty Places</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{sections.length} sections · {dutyPlaces.length} duty places</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-1" /> Template CSV
        </Button>
        <label className="cursor-pointer">
          <input type="file" accept=".csv" className="hidden" onChange={handleImportDutyPlaces} />
          <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import CSV</span></Button>
        </label>
        <div className="flex gap-2">
          <Input placeholder="New section name" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} className="w-48 bg-muted/30" />
          <Button size="sm" onClick={async () => {
            const error = await addSection(newSectionName);
            if (error) { toast.error(error); return; }
            setNewSectionName('');
            toast.success('Section added');
          }}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, i) => {
        const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
        const eligibleMaleHeads = getEligibleHeads(section.id, 'Male');
        const eligibleFemaleCoHeads = getEligibleHeads(section.id, 'Female');

        return (
          <motion.div
            key={section.id}
            className="duty-card space-y-4"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-center justify-between">
              {editingSectionId === section.id ? (
                <div className="flex items-center gap-2">
                  <Input value={editingSectionName} onChange={(e) => setEditingSectionName(e.target.value)} className="w-48 h-8 bg-muted/30" />
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { renameSection(section.id, editingSectionName); setEditingSectionId(null); toast.success('Renamed'); }}>
                    <Check className="h-3 w-3 text-success" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingSectionId(null)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {section.name}
                  <Badge variant="outline" className="text-xs">{sectionDps.length}</Badge>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-50 hover:opacity-100" onClick={() => { setEditingSectionId(section.id); setEditingSectionName(section.name); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </h3>
              )}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => { removeSection(section.id); toast.success('Section removed'); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Head / Co-Head */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">Section Head (Male)</label>
                <Select value={section.headId || '_none'} onValueChange={(v) => setSectionHead(section.id, v === '_none' ? undefined : v)}>
                  <SelectTrigger className="bg-muted/20 border-border/40"><SelectValue placeholder="Select head..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {eligibleMaleHeads.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (G{p.grade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">Co-Head (Female)</label>
                <Select value={section.coHeadId || '_none'} onValueChange={(v) => setSectionCoHead(section.id, v === '_none' ? undefined : v)}>
                  <SelectTrigger className="bg-muted/20 border-border/40"><SelectValue placeholder="Select co-head..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {eligibleFemaleCoHeads.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (G{p.grade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              {sectionDps.map(renderDpRow)}
            </div>
            {renderAddDpForm(section.id)}
          </motion.div>
        );
      })}

      {/* General Duties */}
      <motion.div className="duty-card space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          GENERAL DUTIES
          <Badge variant="outline" className="text-xs">{generalDps.length}</Badge>
        </h3>
        <div className="space-y-1.5">
          {generalDps.map(renderDpRow)}
        </div>
        {renderAddDpForm('__general__')}
      </motion.div>
    </div>
  );
}
