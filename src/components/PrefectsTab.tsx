import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Prefect, Gender, GRADE_RANGE, calculateLevel, generateId } from '@/types/prefect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Upload, Download, Edit2, Crown, Shield } from 'lucide-react';
import { toast } from 'sonner';

export function PrefectsTab() {
  const { prefects, addPrefect, updatePrefect, removePrefect, importPrefects, getPrefectDuty, isSectionHeadOrCoHead } = usePrefectStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', regNo: '', grade: 5, gender: 'Male' as Gender, isHeadPrefect: false, isDeputyHeadPrefect: false });

  const handleAdd = () => {
    if (!form.name || !form.regNo) { toast.error('Name and Reg No required'); return; }
    addPrefect(form);
    setForm({ name: '', regNo: '', grade: 5, gender: 'Male', isHeadPrefect: false, isDeputyHeadPrefect: false });
    setShowAdd(false);
    toast.success('Prefect added');
  };

  const handleUpdate = () => {
    if (!editId) return;
    updatePrefect(editId, form);
    setEditId(null);
    toast.success('Prefect updated');
  };

  const handleExport = () => {
    const csv = ['Name,RegNo,Grade,Gender,HeadPrefect,DeputyHeadPrefect'];
    prefects.forEach((p) => csv.push(`${p.name},${p.regNo},${p.grade},${p.gender},${p.isHeadPrefect || false},${p.isDeputyHeadPrefect || false}`));
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prefects.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').slice(1).filter(Boolean);
      const parsed = lines.map((line) => {
        const [name, regNo, grade, gender, hp, dhp] = line.split(',').map((s) => s.trim());
        return {
          name,
          regNo,
          grade: parseInt(grade) || 5,
          gender: (gender === 'Female' ? 'Female' : 'Male') as Gender,
          isHeadPrefect: hp === 'true',
          isDeputyHeadPrefect: dhp === 'true',
        };
      });
      importPrefects(parsed);
      toast.success(`Imported ${parsed.length} prefects`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startEdit = (p: Prefect) => {
    setEditId(p.id);
    setForm({ name: p.name, regNo: p.regNo, grade: p.grade, gender: p.gender, isHeadPrefect: p.isHeadPrefect || false, isDeputyHeadPrefect: p.isDeputyHeadPrefect || false });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Prefects ({prefects.length})</h2>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button>
          </label>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
          <Button size="sm" onClick={() => { setShowAdd(true); setEditId(null); setForm({ name: '', regNo: '', grade: 5, gender: 'Male', isHeadPrefect: false, isDeputyHeadPrefect: false }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Prefect
          </Button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {(showAdd || editId) && (
        <div className="duty-card space-y-3">
          <h3 className="font-semibold text-foreground">{editId ? 'Edit Prefect' : 'Add Prefect'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Reg No" value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value })} />
            <Select value={String(form.grade)} onValueChange={(v) => setForm({ ...form, grade: parseInt(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GRADE_RANGE.map((g) => <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as Gender })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isHeadPrefect} onChange={(e) => setForm({ ...form, isHeadPrefect: e.target.checked, isDeputyHeadPrefect: false })} />
              Head Prefect
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDeputyHeadPrefect} onChange={(e) => setForm({ ...form, isDeputyHeadPrefect: e.target.checked, isHeadPrefect: false })} />
              Deputy Head Prefect
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={editId ? handleUpdate : handleAdd}>{editId ? 'Save' : 'Add'}</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Name</TableHead>
              <TableHead>Reg No</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prefects.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No prefects added yet. Click "Add Prefect" to begin.</TableCell></TableRow>
            )}
            {prefects.map((p) => {
              const duty = getPrefectDuty(p.id);
              const isLeader = isSectionHeadOrCoHead(p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-sm">{p.regNo}</TableCell>
                  <TableCell>{p.grade}</TableCell>
                  <TableCell>{p.gender}</TableCell>
                  <TableCell><Badge variant={p.level === 'Senior' ? 'default' : 'secondary'}>{p.level}</Badge></TableCell>
                  <TableCell>
                    {p.isHeadPrefect && <span className="badge-info flex items-center gap-1"><Crown className="h-3 w-3" /> Head Prefect</span>}
                    {p.isDeputyHeadPrefect && <span className="badge-info flex items-center gap-1"><Shield className="h-3 w-3" /> Deputy</span>}
                    {isLeader && <span className="badge-success">Section Leader</span>}
                    {duty && <span className="badge-warning">On Duty</span>}
                    {!p.isHeadPrefect && !p.isDeputyHeadPrefect && !isLeader && !duty && <span className="text-muted-foreground text-sm">Available</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(p)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => { removePrefect(p.id); toast.success('Removed'); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
