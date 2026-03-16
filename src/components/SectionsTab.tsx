import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, MapPin, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export function SectionsTab() {
  const {
    sections, dutyPlaces, prefects, assignments,
    addSection, removeSection, renameSection,
    setSectionHead, setSectionCoHead,
    addDutyPlace, removeDutyPlace, updateDutyPlace,
    isSectionHeadOrCoHead, getPrefectDuty, getAssignedPrefect,
  } = usePrefectStore();

  const [newSectionName, setNewSectionName] = useState('');
  const [newDpForm, setNewDpForm] = useState({ name: '', sectionId: '', isSpecial: false, isMandatory: false, requiredGenderBalance: false, maxPrefects: 1 });
  const [showAddDp, setShowAddDp] = useState<string | null>(null); // sectionId or '__general__'
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [editingDpId, setEditingDpId] = useState<string | null>(null);
  const [editingDpForm, setEditingDpForm] = useState<Record<string, any>>({});

  const getEligibleHeads = (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return [];
    const sectionGradeMatch = section.name.match(/GRADE (\d+)/);
    const sectionGrade = sectionGradeMatch ? parseInt(sectionGradeMatch[1]) : 0;

    return prefects.filter((p) => {
      if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
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
    setEditingDpForm({
      name: dp.name,
      isSpecial: dp.isSpecial || false,
      isMandatory: dp.isMandatory || false,
      requiredGenderBalance: dp.requiredGenderBalance || false,
      maxPrefects: dp.maxPrefects || 1,
      sectionId: dp.sectionId || '',
    });
  };

  const saveEditDp = async () => {
    if (!editingDpId) return;
    await updateDutyPlace(editingDpId, editingDpForm);
    setEditingDpId(null);
    toast.success('Duty place updated');
  };

  // General duty places (no section)
  const generalDps = dutyPlaces.filter((dp) => !dp.sectionId);

  const renderDpTable = (dps: typeof dutyPlaces, groupId: string) => (
    <>
      {dps.length > 0 && (
        <div className="rounded border bg-muted/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duty Place</TableHead>
                <TableHead>Special</TableHead>
                <TableHead>Mandatory</TableHead>
                <TableHead>Gender Balance</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Section</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dps.map((dp) => (
                editingDpId === dp.id ? (
                  <TableRow key={dp.id}>
                    <TableCell><Input value={editingDpForm.name} onChange={(e) => setEditingDpForm({ ...editingDpForm, name: e.target.value })} className="h-7 w-28" /></TableCell>
                    <TableCell><Checkbox checked={editingDpForm.isSpecial} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, isSpecial: !!c })} /></TableCell>
                    <TableCell><Checkbox checked={editingDpForm.isMandatory} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, isMandatory: !!c })} /></TableCell>
                    <TableCell><Checkbox checked={editingDpForm.requiredGenderBalance} onCheckedChange={(c) => setEditingDpForm({ ...editingDpForm, requiredGenderBalance: !!c })} /></TableCell>
                    <TableCell><Input type="number" min={1} max={10} value={editingDpForm.maxPrefects} onChange={(e) => setEditingDpForm({ ...editingDpForm, maxPrefects: parseInt(e.target.value) || 1 })} className="h-7 w-14" /></TableCell>
                    <TableCell>
                      <Select value={editingDpForm.sectionId || '_none'} onValueChange={(v) => setEditingDpForm({ ...editingDpForm, sectionId: v === '_none' ? '' : v })}>
                        <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— None —</SelectItem>
                          {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={saveEditDp}><Check className="h-3 w-3 text-green-600" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingDpId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={dp.id}>
                    <TableCell className="font-medium">{dp.name}</TableCell>
                    <TableCell>{dp.isSpecial ? <span className="badge-info">Special</span> : '—'}</TableCell>
                    <TableCell>{dp.isMandatory ? <span className="badge-warning">Required</span> : 'Optional'}</TableCell>
                    <TableCell>{dp.requiredGenderBalance ? '✓' : '—'}</TableCell>
                    <TableCell>{dp.maxPrefects || 1}</TableCell>
                    <TableCell>{dp.sectionId ? sections.find((s) => s.id === dp.sectionId)?.name || '—' : '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEditDp(dp)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => { removeDutyPlace(dp.id); toast.success('Removed'); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showAddDp === groupId ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <Input placeholder="Place name" value={newDpForm.name} onChange={(e) => setNewDpForm({ ...newDpForm, name: e.target.value })} />
          <label className="flex items-center gap-1 text-sm"><Checkbox checked={newDpForm.isSpecial} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isSpecial: !!c })} /> Special</label>
          <label className="flex items-center gap-1 text-sm"><Checkbox checked={newDpForm.isMandatory} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isMandatory: !!c })} /> Mandatory</label>
          <label className="flex items-center gap-1 text-sm"><Checkbox checked={newDpForm.requiredGenderBalance} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, requiredGenderBalance: !!c })} /> Gender Bal.</label>
          <div className="flex gap-1">
            <Input type="number" min={1} max={10} value={newDpForm.maxPrefects} onChange={(e) => setNewDpForm({ ...newDpForm, maxPrefects: parseInt(e.target.value) || 1 })} className="w-16" />
            <Button size="sm" onClick={() => {
              if (!newDpForm.name) return;
              addDutyPlace({ ...newDpForm });
              setNewDpForm({ name: '', sectionId: newDpForm.sectionId, isSpecial: false, isMandatory: false, requiredGenderBalance: false, maxPrefects: 1 });
              setShowAddDp(null);
              toast.success('Added');
            }}>Add</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddDp(null)}>×</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => { setShowAddDp(groupId); setNewDpForm({ ...newDpForm, sectionId: groupId === '__general__' ? '' : groupId, name: '' }); }}>
          <Plus className="h-3 w-3 mr-1" /> Add Duty Place
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Add Section */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-foreground flex-1">Sections & Duty Places</h2>
        <Input placeholder="New section name" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} className="w-48" />
        <Button size="sm" onClick={() => { if (!newSectionName) return; addSection(newSectionName); setNewSectionName(''); toast.success('Section added'); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Section
        </Button>
      </div>

      {/* Sections Grid */}
      {sections.map((section) => {
        const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
        const eligibleMaleHeads = getEligibleHeads(section.id).filter((p) => p.gender === 'Male');
        const eligibleFemaleCoHeads = getEligibleHeads(section.id).filter((p) => p.gender === 'Female');

        return (
          <div key={section.id} className="duty-card space-y-3">
            <div className="flex items-center justify-between">
              {editingSectionId === section.id ? (
                <div className="flex items-center gap-2">
                  <Input value={editingSectionName} onChange={(e) => setEditingSectionName(e.target.value)} className="w-48 h-8" />
                  <Button variant="ghost" size="sm" onClick={() => { renameSection(section.id, editingSectionName); setEditingSectionId(null); toast.success('Renamed'); }}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingSectionId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {section.name}
                  <Badge variant="outline">{sectionDps.length} places</Badge>
                  <Button variant="ghost" size="sm" onClick={() => { setEditingSectionId(section.id); setEditingSectionName(section.name); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </h3>
              )}
              <Button variant="ghost" size="sm" onClick={() => { removeSection(section.id); toast.success('Section removed'); }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            {/* Head / Co-Head */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Section Head (Male)</label>
                <Select value={section.headId || '_none'} onValueChange={(v) => setSectionHead(section.id, v === '_none' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Select head..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {eligibleMaleHeads.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (G{p.grade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Co-Head (Female)</label>
                <Select value={section.coHeadId || '_none'} onValueChange={(v) => setSectionCoHead(section.id, v === '_none' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Select co-head..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {eligibleFemaleCoHeads.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (G{p.grade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {renderDpTable(sectionDps, section.id)}
          </div>
        );
      })}

      {/* General Duties (no section) */}
      <div className="duty-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            GENERAL DUTIES
            <Badge variant="outline">{generalDps.length} places</Badge>
          </h3>
        </div>
        {renderDpTable(generalDps, '__general__')}
      </div>
    </div>
  );
}
