import { useDeferredValue, useMemo, useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Prefect, Gender, GRADE_RANGE, calculateLevel } from '@/types/prefect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Trash2, Upload, Download, Edit2, Crown, Shield, Trophy, User, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { normalizeHeader, parseCsv } from '@/utils/csv';

export function PrefectsTab() {
  const { prefects, assignments, sections, addPrefect, updatePrefect, removePrefect, importPrefects } = usePrefectStore(useShallow((state) => ({
    prefects: state.prefects,
    assignments: state.assignments,
    sections: state.sections,
    addPrefect: state.addPrefect,
    updatePrefect: state.updatePrefect,
    removePrefect: state.removePrefect,
    importPrefects: state.importPrefects,
  })));
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prefect | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_duty' | 'not_on_duty' | 'leaders'>('all');
  const [form, setForm] = useState({ name: '', regNo: '', grade: 5, gender: 'Male' as Gender, isHeadPrefect: false, isDeputyHeadPrefect: false, isGamesCaptain: false });
  const deferredSearch = useDeferredValue(search);

  const headPrefectCount = useMemo(() => prefects.filter((p) => p.isHeadPrefect).length, [prefects]);
  const deputyHeadPrefectCount = useMemo(() => prefects.filter((p) => p.isDeputyHeadPrefect).length, [prefects]);
  const gamesCaptainCount = useMemo(() => prefects.filter((p) => p.isGamesCaptain).length, [prefects]);
  const dutyPrefectIds = useMemo(() => new Set(assignments.map((assignment) => assignment.prefectId)), [assignments]);
  const leaderPrefectIds = useMemo(() => {
    const ids = new Set<string>();
    sections.forEach((section) => {
      if (section.headId) ids.add(section.headId);
      if (section.coHeadId) ids.add(section.coHeadId);
    });
    return ids;
  }, [sections]);

  const filtered = useMemo(() => {
    const query = deferredSearch.toLowerCase();
    return prefects
      .filter((p) => p.name.toLowerCase().includes(query) || p.regNo.toLowerCase().includes(query))
      .filter((p) => {
        const onDuty = dutyPrefectIds.has(p.id);
        const isLeader = leaderPrefectIds.has(p.id);
        if (statusFilter === 'all') return true;
        if (statusFilter === 'leaders') return isLeader;
        if (statusFilter === 'on_duty') return onDuty;
        if (statusFilter === 'not_on_duty') return !onDuty && !isLeader && !p.isHeadPrefect && !p.isDeputyHeadPrefect && !p.isGamesCaptain;
        return true;
      });
  }, [deferredSearch, dutyPrefectIds, leaderPrefectIds, prefects, statusFilter]);

  const handleAdd = async () => {
    if (!form.name || !form.regNo) { toast.error('Name and Reg No required'); return; }
    if (form.isHeadPrefect && headPrefectCount >= 2) { toast.error('Maximum 2 Head Prefects allowed'); return; }
    if (form.isDeputyHeadPrefect && deputyHeadPrefectCount >= 4) { toast.error('Maximum 4 Deputy Head Prefects allowed'); return; }
    const err = await addPrefect(form);
    if (err) { toast.error(`Save failed: ${err}`); return; }
    setForm({ name: '', regNo: '', grade: 5, gender: 'Male', isHeadPrefect: false, isDeputyHeadPrefect: false, isGamesCaptain: false });
    setShowAdd(false);
    toast.success('Prefect added');
  };

  const handleUpdate = async () => {
    if (!editId) return;
    const current = prefects.find((p) => p.id === editId);
    if (form.isHeadPrefect && !current?.isHeadPrefect && headPrefectCount >= 2) { toast.error('Maximum 2 Head Prefects allowed'); return; }
    if (form.isDeputyHeadPrefect && !current?.isDeputyHeadPrefect && deputyHeadPrefectCount >= 4) { toast.error('Maximum 4 Deputy Head Prefects allowed'); return; }
    const err = await updatePrefect(editId, form);
    if (err) { toast.error(`Update failed: ${err}`); return; }
    setEditId(null);
    toast.success('Prefect updated');
  };

  const handleExport = () => {
    const csv = ['Name,RegNo,Grade,Gender,HeadPrefect,DeputyHeadPrefect,GamesCaptain'];
    prefects.forEach((p) => csv.push(`${p.name},${p.regNo},${p.grade},${p.gender},${p.isHeadPrefect || false},${p.isDeputyHeadPrefect || false},${p.isGamesCaptain || false}`));
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'prefects.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) || '';
      const { headers, rows } = parseCsv(text);
      const headerIndex: Record<string, number> = {};
      headers.forEach((h, idx) => {
        const key = normalizeHeader(h);
        if (key) headerIndex[key] = idx;
      });

      const get = (r: string[], key: string, fallbackIdx?: number) => {
        const idx = headerIndex[key];
        if (idx !== undefined) return (r[idx] || '').trim();
        if (fallbackIdx !== undefined) return (r[fallbackIdx] || '').trim();
        return '';
      };

      const parseBool = (v: string) => {
        const s = (v || '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
      };

      const parsed = rows
        .map((r) => {
          const name = get(r, 'name', 0);
          const regNo = get(r, 'regno') || get(r, 'regnumber') || get(r, 'reg') || (r[1] || '').trim();
          const gradeRaw = get(r, 'grade', 2);
          const genderRaw = get(r, 'gender', 3).toLowerCase();
          const gender: Gender = genderRaw === 'female' || genderRaw === 'f' ? 'Female' : 'Male';
          return {
            name,
            regNo,
            grade: parseInt(gradeRaw, 10) || 5,
            gender,
            isHeadPrefect: parseBool(get(r, 'headprefect') || get(r, 'hp') || (r[4] || '')),
            isDeputyHeadPrefect: parseBool(get(r, 'deputyheadprefect') || get(r, 'deputyhead') || get(r, 'dhp') || (r[5] || '')),
            isGamesCaptain: parseBool(get(r, 'gamescaptain') || get(r, 'gc') || (r[6] || '')),
          };
        })
        .filter((p) => p.name && p.regNo);

      if (parsed.length === 0) {
        toast.error('No valid prefect rows found in CSV');
        return;
      }

      const err = await importPrefects(parsed);
      if (err) {
        toast.error(`Import failed: ${err}`);
        return;
      }
      toast.success(`Imported ${parsed.length} prefects`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startEdit = (p: Prefect) => {
    setEditId(p.id);
    setForm({ name: p.name, regNo: p.regNo, grade: p.grade, gender: p.gender, isHeadPrefect: p.isHeadPrefect || false, isDeputyHeadPrefect: p.isDeputyHeadPrefect || false, isGamesCaptain: p.isGamesCaptain || false });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const err = await removePrefect(deleteTarget.id);
    if (err) toast.error(err);
    else toast.success('Removed');
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prefect?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will remove ${deleteTarget.name} from the prefect list. This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Prefects</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{prefects.length} total members</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button>
          </label>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', regNo: '', grade: 5, gender: 'Male', isHeadPrefect: false, isDeputyHeadPrefect: false, isGamesCaptain: false }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Prefect
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="duty-card flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'hsl(38 100% 56% / 0.1)' }}>
            <Crown className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Head Prefects</p>
            <p className="text-lg font-bold text-foreground">{headPrefectCount}<span className="text-xs text-muted-foreground font-normal">/2</span></p>
          </div>
        </div>
        <div className="duty-card flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'hsl(210 80% 55% / 0.1)' }}>
            <Shield className="h-4 w-4" style={{ color: 'hsl(210 80% 55%)' }} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Deputy Heads</p>
            <p className="text-lg font-bold text-foreground">{deputyHeadPrefectCount}<span className="text-xs text-muted-foreground font-normal">/4</span></p>
          </div>
        </div>
        <div className="duty-card flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'hsl(146 70% 40% / 0.12)' }}>
            <Trophy className="h-4 w-4" style={{ color: 'hsl(146 70% 40%)' }} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Games Captains</p>
            <p className="text-lg font-bold text-foreground">{gamesCaptainCount}</p>
          </div>
        </div>
        <div className="duty-card flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--success) / 0.1)' }}>
            <User className="h-4 w-4 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Junior (≤G5)</p>
            <p className="text-lg font-bold text-foreground">{prefects.filter((p) => p.level === 'Junior').length}</p>
          </div>
        </div>
        <div className="duty-card flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--warning) / 0.1)' }}>
            <User className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Senior (G6+)</p>
            <p className="text-lg font-bold text-foreground">{prefects.filter((p) => p.level === 'Senior').length}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prefects by name or reg no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11 bg-muted/30 border-border/50"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-11 w-full md:w-56 bg-muted/30 border-border/50">
            <SelectValue placeholder="Filter..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="on_duty">On duty</SelectItem>
            <SelectItem value="not_on_duty">Not on duty</SelectItem>
            <SelectItem value="leaders">Section leaders</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Add/Edit Form */}
      {(showAdd || editId) && (
          <div className="duty-card space-y-4">
            <h3 className="font-semibold text-foreground text-sm">{editId ? 'Edit Prefect' : 'New Prefect'}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-muted/30" />
              <Input placeholder="Reg No" value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value })} className="bg-muted/30" />
              <Select value={String(form.grade)} onValueChange={(v) => setForm({ ...form, grade: parseInt(v) })}>
                <SelectTrigger className="bg-muted/30"><SelectValue /></SelectTrigger>
                <SelectContent>{GRADE_RANGE.map((g) => <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as Gender })}>
                <SelectTrigger className="bg-muted/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isHeadPrefect} onChange={(e) => setForm({ ...form, isHeadPrefect: e.target.checked, isDeputyHeadPrefect: false, isGamesCaptain: false })} className="accent-primary" />
                <span className="text-muted-foreground">Head Prefect</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isDeputyHeadPrefect} onChange={(e) => setForm({ ...form, isDeputyHeadPrefect: e.target.checked, isHeadPrefect: false, isGamesCaptain: false })} className="accent-primary" />
                <span className="text-muted-foreground">Deputy Head</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isGamesCaptain} onChange={(e) => setForm({ ...form, isGamesCaptain: e.target.checked, isHeadPrefect: false, isDeputyHeadPrefect: false })} className="accent-primary" />
                <span className="text-muted-foreground">Games Captain</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={editId ? handleUpdate : handleAdd}>{editId ? 'Save Changes' : 'Add Prefect'}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
            </div>
          </div>
        )}

      {/* Prefect Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              {search ? 'No prefects match your search.' : 'No prefects added yet. Click "Add Prefect" to begin.'}
            </div>
          )}
          {filtered.map((p, i) => {
            const duty = dutyPrefectIds.has(p.id);
            const isLeader = leaderPrefectIds.has(p.id);
            return (
              <div
                key={p.id}
                className="duty-card group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-xs font-bold ${
                      p.isHeadPrefect ? 'bg-primary/20 text-primary' :
                      p.isDeputyHeadPrefect ? 'text-foreground' : 'text-muted-foreground'
                    }`} style={p.isDeputyHeadPrefect ? { background: 'hsl(210 80% 55% / 0.15)', color: 'hsl(210 80% 55%)' } : !p.isHeadPrefect ? { background: 'hsl(var(--muted))' } : undefined}>
                      {p.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.regNo}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(p)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">G{p.grade}</Badge>
                  <Badge variant="outline" className="text-xs">{p.gender}</Badge>
                  <Badge variant={p.level === 'Senior' ? 'default' : 'secondary'} className="text-xs">{p.level}</Badge>
                  {p.isHeadPrefect && <span className="badge-info text-xs flex items-center gap-1"><Crown className="h-3 w-3" /> HP</span>}
                  {p.isDeputyHeadPrefect && <span className="badge-info text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> DHP</span>}
                  {p.isGamesCaptain && <span className="badge-info text-xs flex items-center gap-1"><Trophy className="h-3 w-3" /> GC</span>}
                  {isLeader && <span className="badge-success text-xs">Section Leader</span>}
                  {duty && <span className="badge-warning text-xs">On Duty</span>}
                  {!p.isHeadPrefect && !p.isDeputyHeadPrefect && !p.isGamesCaptain && !isLeader && !duty && <span className="text-xs text-muted-foreground">Available</span>}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
