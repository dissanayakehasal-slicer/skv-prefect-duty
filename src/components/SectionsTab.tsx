import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, MapPin, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export function SectionsTab() {
  const { sections, dutyPlaces, prefects, addSection, removeSection, setSectionHead, setSectionCoHead, addDutyPlace, removeDutyPlace, isSectionHeadOrCoHead, getPrefectDuty } = usePrefectStore();
  const [newSectionName, setNewSectionName] = useState('');
  const [newDpForm, setNewDpForm] = useState({ name: '', sectionId: '', isSpecial: false, isMandatory: false, requiredGenderBalance: false, maxPrefects: 1 });
  const [showAddDp, setShowAddDp] = useState(false);

  const getEligibleHeads = (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return [];
    const sectionName = section.name;
    const sectionGradeMatch = sectionName.match(/GRADE (\d+)/);
    const sectionGrade = sectionGradeMatch ? parseInt(sectionGradeMatch[1]) : 0;

    return prefects.filter((p) => {
      if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
      // Already has duty (not as head/co-head of THIS section)
      const hasDuty = getPrefectDuty(p.id);
      const isLeaderElsewhere = sections.some((s) => s.id !== sectionId && (s.headId === p.id || s.coHeadId === p.id));
      if (hasDuty || isLeaderElsewhere) return false;
      // Already head/co-head of this section is ok (for re-selection)
      if (section.headId === p.id || section.coHeadId === p.id) return true;
      // Seniority: 2+ grades senior, or Grade 11 can lead 10/11
      if (sectionGrade > 0) {
        if (p.grade === 11 && (sectionGrade === 10 || sectionGrade === 11)) return true;
        return p.grade >= sectionGrade + 2;
      }
      return p.grade >= 8; // For non-grade sections, must be senior
    });
  };

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
        const head = prefects.find((p) => p.id === section.headId);
        const coHead = prefects.find((p) => p.id === section.coHeadId);

        return (
          <div key={section.id} className="duty-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {section.name}
                <Badge variant="outline">{sectionDps.length} places</Badge>
              </h3>
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

            {/* Duty Places List */}
            {sectionDps.length > 0 && (
              <div className="rounded border bg-muted/30">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Duty Place</TableHead>
                      <TableHead>Special</TableHead>
                      <TableHead>Mandatory</TableHead>
                      <TableHead>Gender Balance</TableHead>
                      <TableHead>Max</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectionDps.map((dp) => (
                      <TableRow key={dp.id}>
                        <TableCell className="font-medium">{dp.name}</TableCell>
                        <TableCell>{dp.isSpecial ? <span className="badge-info">Special</span> : '—'}</TableCell>
                        <TableCell>{dp.isMandatory ? <span className="badge-warning">Required</span> : 'Optional'}</TableCell>
                        <TableCell>{dp.requiredGenderBalance ? '✓' : '—'}</TableCell>
                        <TableCell>{dp.maxPrefects || 1}</TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => { removeDutyPlace(dp.id); toast.success('Removed'); }}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Add Duty Place */}
            {showAddDp && newDpForm.sectionId === section.id ? (
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
                    setNewDpForm({ name: '', sectionId: section.id, isSpecial: false, isMandatory: false, requiredGenderBalance: false, maxPrefects: 1 });
                    setShowAddDp(false);
                    toast.success('Added');
                  }}>Add</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowAddDp(false)}>×</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { setShowAddDp(true); setNewDpForm({ ...newDpForm, sectionId: section.id, name: '' }); }}>
                <Plus className="h-3 w-3 mr-1" /> Add Duty Place
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
