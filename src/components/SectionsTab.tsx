import { useState } from 'react';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, MapPin, Pencil, Check, X, Upload, Download, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { normalizeHeader, parseCsv } from '@/utils/csv';
import { GRADE_RANGE } from '@/types/prefect';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

function SearchableHeadPicker({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onValueChange: (id: string) => void;
  options: { id: string; name: string; grade: number; gender: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between bg-muted/20 border-border/40 text-xs font-normal px-2',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">
            {value === '_none'
              ? '— None —'
              : selected
                ? `${selected.name} (G${selected.grade}, ${selected.gender?.[0] ?? '—'})`
                : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
        {open && (
          <Command shouldFilter>
            <CommandInput placeholder="Search name…" className="h-9" />
            <CommandList>
              <CommandEmpty>No prefect found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="_none"
                  onSelect={() => {
                    onValueChange('_none');
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === '_none' ? 'opacity-100' : 'opacity-0')} />
                  — None —
                </CommandItem>
                {options.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.id}`}
                    onSelect={() => {
                      onValueChange(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">
                      {p.name} <span className="text-muted-foreground">(G{p.grade}, {p.gender?.[0] ?? '—'})</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface SectionsTabProps {
  /** Add/remove sections, duty places, CSV import */
  canManageStructure?: boolean;
  /** Edit section heads, duty place rows, and rules. False for viewer (read-only). */
  canEditDutyContent?: boolean;
}

export function SectionsTab({ canManageStructure = true, canEditDutyContent = true }: SectionsTabProps) {
  const {
    sections, dutyPlaces, prefects,
    addSection, removeSection, renameSection,
    setSectionHead, setSectionCoHead,
    addDutyPlace, removeDutyPlace, updateDutyPlace, importDutyPlaces,
    isSectionHeadOrCoHead, getPrefectDuty,
  } = usePrefectStore();

  const [newSectionName, setNewSectionName] = useState('');
  const [newDpForm, setNewDpForm] = useState({
    name: '',
    sectionId: '',
    isSpecial: false,
    isMandatory: false,
    requiredGenderBalance: false,
    minPrefects: 1,
    maxPrefects: 2,
    genderRequirement: '',
    gradeRequirement: '',
    sameGradeIfMultiple: false,
  });
  const [showAddDp, setShowAddDp] = useState<string | null>(null);
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
      if (p.isHeadPrefect || p.isDeputyHeadPrefect || p.isGamesCaptain) return false;
      // Keep current selections in list even if they'd fail new filters
      if (section.headId === p.id || section.coHeadId === p.id) return true;
      const hasDuty = getPrefectDuty(p.id);
      const isLeaderElsewhere = sections.some((s) => s.id !== sectionId && (s.headId === p.id || s.coHeadId === p.id));
      if (hasDuty || isLeaderElsewhere) return false;
      if (sectionGrade > 0) return p.grade >= sectionGrade + 1;
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
      minPrefects: dp.minPrefects ?? 1,
      maxPrefects: dp.maxPrefects ?? 1,
      sectionId: dp.sectionId || '',
      genderRequirement: dp.genderRequirement || '',
      gradeRequirement: dp.gradeRequirement || '',
      sameGradeIfMultiple: dp.sameGradeIfMultiple || false,
    });
  };

  const parseGradeList = (raw: string): number[] => {
    const parts = (raw || '')
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return Array.from(new Set(parts)).sort((a, b) => a - b);
  };

  const setGradeToggle = (form: Record<string, any>, setter: (next: any) => void, grade: number, enabled: boolean) => {
    const current = parseGradeList(form.gradeRequirement || '');
    const next = enabled ? Array.from(new Set([...current, grade])) : current.filter((g) => g !== grade);
    setter({ ...form, gradeRequirement: next.join(',') });
  };

  const renderEligibility = (form: Record<string, any>, setter: (next: any) => void) => {
    const selectedGrades = new Set(parseGradeList(form.gradeRequirement || ''));
    const genderValue = form.genderRequirement === 'M' ? 'M' : form.genderRequirement === 'F' ? 'F' : '_any';
    return (
      <div className="w-full grid grid-cols-2 md:grid-cols-8 gap-2 rounded-lg bg-muted/10 border border-border/40 p-3">
        <div className="col-span-2 md:col-span-4">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Allowed grades</label>
          <div className="flex flex-wrap gap-2">
            {GRADE_RANGE.map((g) => (
              <label key={g} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={selectedGrades.has(g)}
                  onCheckedChange={(c) => setGradeToggle(form, setter, g, !!c)}
                />
                G{g}
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => setter({ ...form, gradeRequirement: '' })}
              disabled={!form.gradeRequirement}
            >
              Clear
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Leave empty = any grade</p>
        </div>

        <div className="col-span-2 md:col-span-2">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Gender requirement</label>
          <Select
            value={genderValue}
            onValueChange={(v) => setter({ ...form, genderRequirement: v === '_any' ? '' : v })}
          >
            <SelectTrigger className="h-9 bg-muted/20 border-border/40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_any">Any</SelectItem>
              <SelectItem value="M">Male only</SelectItem>
              <SelectItem value="F">Female only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">Used by auto-assign for special duties</p>
        </div>

        <div className="col-span-2 md:col-span-2 flex flex-col justify-between">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Multiple-prefect rules</label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={!!form.sameGradeIfMultiple}
                onCheckedChange={(c) => setter({ ...form, sameGradeIfMultiple: !!c })}
              />
              Same grade if multiple assigned
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Optional constraint for manual checks</p>
        </div>
      </div>
    );
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
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsv(text);

      const headerIndex: Record<string, number> = {};
      headers.forEach((h, idx) => {
        const key = normalizeHeader(h);
        if (key) headerIndex[key] = idx;
      });

      const get = (r: string[], key: string, fallbackIdx?: number) => {
        const idx = headerIndex[key];
        if (idx !== undefined) return r[idx] ?? '';
        if (fallbackIdx !== undefined) return r[fallbackIdx] ?? '';
        return '';
      };

      const parseBool = (v: string) => {
        const s = (v || '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
      };

      const resolveSectionId = (raw: string) => {
        const s = (raw || '').trim();
        if (!s) return '';
        const byId = sections.find((sec) => sec.id === s);
        if (byId) return byId.id;
        const normalized = s.toLowerCase();
        const byName = sections.find((sec) => sec.name.trim().toLowerCase() === normalized);
        return byName?.id || '';
      };

      const parsed = rows
        .map((r) => {
          const name = get(r, 'name', 0).trim();
          const sectionRaw =
            get(r, 'sectionid') ||
            get(r, 'section') ||
            get(r, 'sectionname') ||
            (r[1] || '');

          const maxRaw = get(r, 'maxprefects') || get(r, 'max') || (r[5] || '');
          const maxPrefects =
            maxRaw.trim().toLowerCase() === 'unlimited'
              ? 0
              : Number.isFinite(parseInt(maxRaw, 10))
                ? parseInt(maxRaw, 10)
                : 2;

          return {
            name,
            sectionId: resolveSectionId(sectionRaw),
            isSpecial: parseBool(get(r, 'special', 2)),
            isMandatory: parseBool(get(r, 'mandatory', 3)),
            minPrefects: parseInt(get(r, 'minprefects', 4), 10) || 0,
            maxPrefects: Math.max(0, maxPrefects),
            requiredGenderBalance: parseBool(get(r, 'genderbalance', 6)),
            genderRequirement: (() => {
              const v = (get(r, 'genderrequirement') || get(r, 'gender') || '').trim().toLowerCase();
              if (!v) return '';
              if (v === 'm' || v === 'male') return 'M';
              if (v === 'f' || v === 'female') return 'F';
              return '';
            })(),
            gradeRequirement: (get(r, 'graderequirement') || get(r, 'grades') || '').trim(),
            sameGradeIfMultiple: parseBool(get(r, 'samegradeifmultiple')),
            __sectionRaw: (sectionRaw || '').trim(),
          };
        })
        .filter((dp) => dp.name);

      if (parsed.length === 0) { toast.error('No valid duty places found'); return; }

      const unknownSections = parsed
        .filter((dp) => dp.__sectionRaw && !dp.sectionId)
        .map((dp) => dp.__sectionRaw);

      const cleaned = parsed.map(({ __sectionRaw, ...dp }) => dp);
      const err = await importDutyPlaces(cleaned);
      if (err) {
        toast.error(`Duty place import failed: ${err}`);
        return;
      }

      if (unknownSections.length > 0) {
        const unique = Array.from(new Set(unknownSections)).slice(0, 5);
        toast.warning(`Imported ${cleaned.length}. Unknown sections ignored: ${unique.join(', ')}${unknownSections.length > unique.length ? '…' : ''}`);
      } else {
        toast.success(`Imported ${cleaned.length} duty places`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const csv = [
      'Name,SectionId,Special,Mandatory,MinPrefects,MaxPrefects,GenderBalance,GenderRequirement,GradeRequirement,SameGradeIfMultiple',
      'Main Gate,,true,true,2,4,true,,10, false',
      '4A,<section-id>,false,true,1,2,false,,,false',
    ];
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'duty_places_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const generalDps = dutyPlaces.filter((dp) => !dp.sectionId);

  const renderDpRow = (dp: typeof dutyPlaces[0]) => {
    if (editingDpId === dp.id && canEditDutyContent) {
      return (
        <div key={dp.id} className="space-y-3 p-3 rounded-lg bg-muted/20 border border-primary/20">
          <div className="grid grid-cols-2 md:grid-cols-8 gap-2 items-center">
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
          <Input type="number" min={0} max={50} value={editingDpForm.maxPrefects} onChange={(e) => setEditingDpForm({ ...editingDpForm, maxPrefects: parseInt(e.target.value) || 0 })} className="h-8 w-14 bg-muted/30 text-sm" />
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
          </div>
          {renderEligibility(editingDpForm, setEditingDpForm)}
        </div>
      );
    }

    return (
      <div
        key={dp.id}
        className="flex items-center justify-between p-3 rounded-lg bg-muted/10 border border-border/30 hover:border-border/60 transition-colors group"
      >
        <div className="flex items-center gap-3 flex-1">
          <span className="font-medium text-sm text-foreground">{dp.name}</span>
          {dp.isSpecial && <Badge variant="outline" className="text-xs border-primary/30 text-primary">Special</Badge>}
          {dp.isMandatory && <span className="badge-warning text-xs">Required</span>}
          {dp.requiredGenderBalance && <span className="text-xs text-muted-foreground">⚤</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {dp.minPrefects ?? 0} – {dp.maxPrefects === 0 ? '∞' : (dp.maxPrefects || 1)} prefects
          </span>
          {(canEditDutyContent || canManageStructure) && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEditDutyContent && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditDp(dp)}><Pencil className="h-3 w-3" /></Button>
            )}
            {canManageStructure && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { removeDutyPlace(dp.id); toast.success('Removed'); }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
            )}
          </div>
          )}
        </div>
      </div>
    );
  };

  const renderAddDpForm = (groupId: string) => {
    if (!canManageStructure || !canEditDutyContent) return null;
    if (showAddDp !== groupId) {
      return (
        <Button variant="outline" size="sm" className="border-dashed border-border/50 text-muted-foreground hover:text-foreground" onClick={() => { setShowAddDp(groupId); setNewDpForm({ ...newDpForm, sectionId: groupId === '__general__' ? '' : groupId, name: '' }); }}>
          <Plus className="h-3 w-3 mr-1" /> Add Duty Place
        </Button>
      );
    }

    return (
      <div className="space-y-3 p-3 rounded-lg bg-muted/10 border border-primary/20">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <Input placeholder="Place name" value={newDpForm.name} onChange={(e) => setNewDpForm({ ...newDpForm, name: e.target.value })} className="bg-muted/30 text-sm" />
          <label className="flex items-center gap-1 text-xs"><Checkbox checked={newDpForm.isSpecial} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isSpecial: !!c })} /> Special</label>
          <label className="flex items-center gap-1 text-xs"><Checkbox checked={newDpForm.isMandatory} onCheckedChange={(c) => setNewDpForm({ ...newDpForm, isMandatory: !!c })} /> Mandatory</label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Min</span>
            <Input type="number" min={0} max={10} value={newDpForm.minPrefects} onChange={(e) => setNewDpForm({ ...newDpForm, minPrefects: parseInt(e.target.value) || 0 })} className="w-14 bg-muted/30 text-sm" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Max</span>
            <Input type="number" min={0} max={50} value={newDpForm.maxPrefects} onChange={(e) => setNewDpForm({ ...newDpForm, maxPrefects: parseInt(e.target.value) || 0 })} className="w-14 bg-muted/30 text-sm" />
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
        </div>
        {renderEligibility(newDpForm as any, setNewDpForm as any)}
      </div>
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
        {canManageStructure && (
        <>
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
        </>
        )}
      </div>

      {/* Sections */}
      {sections.map((section, i) => {
        const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
        const eligibleHeads = getEligibleHeads(section.id);

        return (
          <div
            key={section.id}
            className="duty-card space-y-4"
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
                  {canManageStructure && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-50 hover:opacity-100" onClick={() => { setEditingSectionId(section.id); setEditingSectionName(section.name); }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  )}
                </h3>
              )}
              {canManageStructure && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  const err = await removeSection(section.id);
                  if (err) toast.error(err);
                  else toast.success('Section removed');
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              )}
            </div>

            {/* Head / Co-Head */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">Section Head</label>
                {canEditDutyContent ? (
                  <SearchableHeadPicker
                    value={section.headId || '_none'}
                    placeholder="Select head…"
                    options={eligibleHeads.filter((p) => p.id !== section.coHeadId)}
                    onValueChange={async (v) => {
                      const err = await setSectionHead(section.id, v === '_none' ? undefined : v);
                      if (err) toast.error(err);
                    }}
                  />
                ) : (
                  <p className="text-sm text-foreground py-2 px-1 rounded-md bg-muted/20 border border-border/40">
                    {section.headId ? (prefects.find((p) => p.id === section.headId)?.name ?? '—') : '—'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block uppercase tracking-wider">Co-Head</label>
                {canEditDutyContent ? (
                  <SearchableHeadPicker
                    value={section.coHeadId || '_none'}
                    placeholder="Select co-head…"
                    options={eligibleHeads.filter((p) => p.id !== section.headId)}
                    onValueChange={async (v) => {
                      const err = await setSectionCoHead(section.id, v === '_none' ? undefined : v);
                      if (err) toast.error(err);
                    }}
                  />
                ) : (
                  <p className="text-sm text-foreground py-2 px-1 rounded-md bg-muted/20 border border-border/40">
                    {section.coHeadId ? (prefects.find((p) => p.id === section.coHeadId)?.name ?? '—') : '—'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {sectionDps.map(renderDpRow)}
            </div>
            {renderAddDpForm(section.id)}
          </div>
        );
      })}

      {/* General Duties */}
      <div className="duty-card space-y-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          GENERAL DUTIES
          <Badge variant="outline" className="text-xs">{generalDps.length}</Badge>
        </h3>
        <div className="space-y-1.5">
          {generalDps.map(renderDpRow)}
        </div>
        {renderAddDpForm('__general__')}
      </div>
    </div>
  );
}
