import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  Prefect, Section, DutyPlace, Assignment, ValidationIssue,
  generateId, calculateLevel, Gender,
} from '@/types/prefect';

interface AutoAssignReport {
  assigned: number;
  skipped: number;
  vacancies: { placeName: string; slotsNeeded: number }[];
  violations: string[];
}

interface PrefectStore {
  prefects: Prefect[];
  sections: Section[];
  dutyPlaces: DutyPlace[];
  assignments: Assignment[];
  loading: boolean;
  initialized: boolean;

  loadFromDB: () => Promise<void>;
  addPrefect: (p: Omit<Prefect, 'id' | 'level'>) => Promise<void>;
  updatePrefect: (id: string, p: Partial<Prefect>) => Promise<void>;
  removePrefect: (id: string) => Promise<string | null>;
  importPrefects: (prefects: Omit<Prefect, 'id' | 'level'>[]) => Promise<void>;
  addSection: (name: string) => Promise<string | null>;
  removeSection: (id: string) => Promise<void>;
  renameSection: (id: string, name: string) => Promise<void>;
  setSectionHead: (sectionId: string, prefectId: string | undefined) => Promise<void>;
  setSectionCoHead: (sectionId: string, prefectId: string | undefined) => Promise<void>;
  addDutyPlace: (dp: Omit<DutyPlace, 'id'>) => Promise<void>;
  removeDutyPlace: (id: string) => Promise<void>;
  updateDutyPlace: (id: string, dp: Partial<DutyPlace>) => Promise<void>;
  importDutyPlaces: (dps: Omit<DutyPlace, 'id'>[]) => Promise<void>;
  assignPrefect: (prefectId: string, dutyPlaceId: string, sectionId: string) => string | null;
  removeAssignment: (assignmentId: string) => Promise<void>;
  swapAssignments: (a1Id: string, a2Id: string) => void;
  clearAllAssignments: () => Promise<void>;
  autoAssign: () => AutoAssignReport;
  validate: () => ValidationIssue[];
  getPrefectDuty: (prefectId: string) => Assignment | undefined;
  getAssignedPrefect: (dutyPlaceId: string) => Assignment[];
  getAvailablePrefects: () => Prefect[];
  isSectionHeadOrCoHead: (prefectId: string) => boolean;
  getDutyCount: (prefectId: string) => number;
}

function getClassGrade(dutyPlaceName: string): number | null {
  const match = dutyPlaceName.match(/^(\d+)[A-E]$/);
  return match ? parseInt(match[1]) : null;
}

function getSectionGrade(sectionName: string): number | null {
  const match = sectionName.match(/GRADE\s+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function isEligibleHead(prefectGrade: number, sectionGrade: number): boolean {
  if (sectionGrade <= 7) return prefectGrade >= sectionGrade + 2;
  if (sectionGrade === 8) return prefectGrade >= 10;
  return prefectGrade === 11;
}

export const usePrefectStore = create<PrefectStore>()((set, get) => ({
  prefects: [],
  sections: [],
  dutyPlaces: [],
  assignments: [],
  loading: false,
  initialized: false,

  loadFromDB: async () => {
    set({ loading: true });
    try {
      const [prefectsRes, sectionsRes, dutyPlacesRes, assignmentsRes] = await Promise.all([
        supabase.from('prefects').select('*').eq('active', true),
        supabase.from('sections').select('*'),
        supabase.from('duty_places').select('*'),
        supabase.from('assignments').select('*'),
      ]);

      const prefects: Prefect[] = (prefectsRes.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        regNo: p.reg_number,
        grade: p.grade,
        gender: (p.gender === 'M' ? 'Male' : 'Female') as Gender,
        level: calculateLevel(p.grade),
        isHeadPrefect: p.role === 'head_prefect',
        isDeputyHeadPrefect: p.role === 'deputy_head_prefect',
      }));

      const sections: Section[] = (sectionsRes.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        headId: s.head_prefect_id || undefined,
        coHeadId: s.co_head_prefect_id || undefined,
        dutyPlaceIds: (dutyPlacesRes.data || []).filter((dp) => dp.section_id === s.id).map((dp) => dp.id),
      }));

      const dutyPlaces: DutyPlace[] = (dutyPlacesRes.data || []).map((dp) => ({
        id: dp.id,
        name: dp.name,
        sectionId: dp.section_id || '',
        isSpecial: dp.type === 'special' || dp.type === 'inspection',
        isMandatory: dp.mandatory_slots > 0,
        requiredGenderBalance: dp.required_gender_balance,
        maxPrefects: dp.max_prefects,
        minPrefects: dp.mandatory_slots,
        genderRequirement: dp.gender_requirement || undefined,
        gradeRequirement: dp.grade_requirement || undefined,
        sameGradeIfMultiple: dp.same_grade_if_multiple,
        mandatorySlots: dp.mandatory_slots,
      }));

      const assignments: Assignment[] = (assignmentsRes.data || []).map((a) => ({
        id: a.id,
        prefectId: a.prefect_id,
        dutyPlaceId: a.duty_place_id,
        sectionId: dutyPlaces.find((dp) => dp.id === a.duty_place_id)?.sectionId || '',
      }));

      set({ prefects, sections, dutyPlaces, assignments, loading: false, initialized: true });
    } catch (err) {
      console.error('Failed to load from DB:', err);
      set({ loading: false });
    }
  },

  addPrefect: async (p) => {
    const { data, error } = await supabase.from('prefects').insert({
      name: p.name, reg_number: p.regNo, grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: p.isHeadPrefect ? 'head_prefect' : p.isDeputyHeadPrefect ? 'deputy_head_prefect' : 'prefect',
    }).select().single();
    if (error || !data) { console.error(error); return; }
    const prefect: Prefect = {
      id: data.id, name: data.name, regNo: data.reg_number, grade: data.grade,
      gender: p.gender, level: calculateLevel(data.grade),
      isHeadPrefect: data.role === 'head_prefect', isDeputyHeadPrefect: data.role === 'deputy_head_prefect',
    };
    set((s) => ({ prefects: [...s.prefects, prefect] }));
  },

  updatePrefect: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.regNo !== undefined) dbUpdates.reg_number = updates.regNo;
    if (updates.grade !== undefined) dbUpdates.grade = updates.grade;
    if (updates.gender !== undefined) dbUpdates.gender = updates.gender === 'Male' ? 'M' : 'F';
    if (updates.isHeadPrefect !== undefined || updates.isDeputyHeadPrefect !== undefined) {
      const current = get().prefects.find((p) => p.id === id);
      const isHP = updates.isHeadPrefect ?? current?.isHeadPrefect;
      const isDHP = updates.isDeputyHeadPrefect ?? current?.isDeputyHeadPrefect;
      dbUpdates.role = isHP ? 'head_prefect' : isDHP ? 'deputy_head_prefect' : 'prefect';
    }
    await supabase.from('prefects').update(dbUpdates).eq('id', id);
    set((s) => ({
      prefects: s.prefects.map((p) =>
        p.id === id ? { ...p, ...updates, level: updates.grade ? calculateLevel(updates.grade) : p.level } : p
      ),
    }));
  },

  removePrefect: async (id) => {
    const state = get();
    if (state.assignments.some((a) => a.prefectId === id)) return 'Cannot delete: prefect has active assignments. Remove those first.';
    if (state.sections.some((s) => s.headId === id || s.coHeadId === id)) return 'Cannot delete: prefect has leadership roles. Remove those first.';
    const { error } = await supabase.from('prefects').update({ active: false }).eq('id', id);
    if (error) return 'Failed to remove: ' + error.message;
    set((s) => ({ prefects: s.prefects.filter((p) => p.id !== id) }));
    return null;
  },

  importPrefects: async (prefects) => {
    const rows = prefects.map((p) => ({
      name: p.name, reg_number: p.regNo, grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: (p.isHeadPrefect ? 'head_prefect' : p.isDeputyHeadPrefect ? 'deputy_head_prefect' : 'prefect') as 'prefect' | 'head_prefect' | 'deputy_head_prefect',
    }));
    const { data, error } = await supabase.from('prefects').insert(rows).select();
    if (error || !data) { console.error(error); return; }
    const newPrefects: Prefect[] = data.map((d) => ({
      id: d.id, name: d.name, regNo: d.reg_number, grade: d.grade,
      gender: (d.gender === 'M' ? 'Male' : 'Female') as Gender,
      level: calculateLevel(d.grade),
      isHeadPrefect: d.role === 'head_prefect', isDeputyHeadPrefect: d.role === 'deputy_head_prefect',
    }));
    set((s) => ({ prefects: [...s.prefects, ...newPrefects] }));
  },

  addSection: async (name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'Section name is required';
    const { data, error } = await supabase.from('sections').insert({ name: trimmedName }).select('id, name, head_prefect_id, co_head_prefect_id').single();
    if (error) return error.message;
    if (!data) return 'Section was not created';
    set((s) => ({ sections: [...s.sections, { id: data.id, name: data.name, headId: data.head_prefect_id || undefined, coHeadId: data.co_head_prefect_id || undefined, dutyPlaceIds: [] }] }));
    return null;
  },

  removeSection: async (id) => {
    const state = get();
    const sectionDpIds = state.dutyPlaces.filter((dp) => dp.sectionId === id).map((dp) => dp.id);
    if (sectionDpIds.length > 0) {
      await supabase.from('assignments').delete().in('duty_place_id', sectionDpIds);
      await supabase.from('duty_places').delete().in('id', sectionDpIds);
    }
    await supabase.from('sections').update({ head_prefect_id: null, co_head_prefect_id: null }).eq('id', id);
    await supabase.from('sections').delete().eq('id', id);
    set((s) => ({
      sections: s.sections.filter((sec) => sec.id !== id),
      dutyPlaces: s.dutyPlaces.filter((dp) => dp.sectionId !== id),
      assignments: s.assignments.filter((a) => !sectionDpIds.includes(a.dutyPlaceId)),
    }));
  },

  renameSection: async (id, name) => {
    await supabase.from('sections').update({ name }).eq('id', id);
    set((s) => ({ sections: s.sections.map((sec) => sec.id === id ? { ...sec, name } : sec) }));
  },

  setSectionHead: async (sectionId, prefectId) => {
    await supabase.from('sections').update({ head_prefect_id: prefectId || null }).eq('id', sectionId);
    set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, headId: prefectId } : sec) }));
  },

  setSectionCoHead: async (sectionId, prefectId) => {
    await supabase.from('sections').update({ co_head_prefect_id: prefectId || null }).eq('id', sectionId);
    set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, coHeadId: prefectId } : sec) }));
  },

  addDutyPlace: async (dp) => {
    const { data, error } = await supabase.from('duty_places').insert({
      name: dp.name,
      section_id: dp.sectionId || null,
      type: dp.isSpecial ? 'special' : 'classroom',
      mandatory_slots: dp.minPrefects ?? (dp.isMandatory ? 1 : 0),
      max_prefects: dp.maxPrefects || 1,
      required_gender_balance: dp.requiredGenderBalance || false,
    }).select().single();
    if (error || !data) return;
    const newDp: DutyPlace = { ...dp, id: data.id };
    set((s) => ({
      dutyPlaces: [...s.dutyPlaces, newDp],
      sections: s.sections.map((sec) => sec.id === dp.sectionId ? { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, data.id] } : sec),
    }));
  },

  removeDutyPlace: async (id) => {
    await supabase.from('assignments').delete().eq('duty_place_id', id);
    await supabase.from('duty_places').delete().eq('id', id);
    set((s) => ({
      dutyPlaces: s.dutyPlaces.filter((dp) => dp.id !== id),
      assignments: s.assignments.filter((a) => a.dutyPlaceId !== id),
      sections: s.sections.map((sec) => ({ ...sec, dutyPlaceIds: sec.dutyPlaceIds.filter((dpId) => dpId !== id) })),
    }));
  },

  updateDutyPlace: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.maxPrefects !== undefined) dbUpdates.max_prefects = updates.maxPrefects;
    if (updates.minPrefects !== undefined) dbUpdates.mandatory_slots = updates.minPrefects;
    if (updates.sectionId !== undefined) dbUpdates.section_id = updates.sectionId || null;
    if (updates.isSpecial !== undefined) dbUpdates.type = updates.isSpecial ? 'special' : 'classroom';
    if (updates.isMandatory !== undefined) dbUpdates.mandatory_slots = updates.isMandatory ? (updates.minPrefects ?? 1) : 0;
    if (updates.requiredGenderBalance !== undefined) dbUpdates.required_gender_balance = updates.requiredGenderBalance;
    if (updates.genderRequirement !== undefined) dbUpdates.gender_requirement = updates.genderRequirement || null;
    if (updates.gradeRequirement !== undefined) dbUpdates.grade_requirement = updates.gradeRequirement || null;
    if (updates.sameGradeIfMultiple !== undefined) dbUpdates.same_grade_if_multiple = updates.sameGradeIfMultiple;
    if (Object.keys(dbUpdates).length > 0) await supabase.from('duty_places').update(dbUpdates).eq('id', id);
    set((s) => {
      const oldDp = s.dutyPlaces.find((dp) => dp.id === id);
      const newDp = { ...oldDp!, ...updates };
      let newSections = s.sections;
      if (updates.sectionId !== undefined && oldDp && oldDp.sectionId !== updates.sectionId) {
        newSections = newSections.map((sec) => {
          if (sec.id === oldDp.sectionId) return { ...sec, dutyPlaceIds: sec.dutyPlaceIds.filter((dpId) => dpId !== id) };
          if (sec.id === updates.sectionId) return { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, id] };
          return sec;
        });
      }
      return { dutyPlaces: s.dutyPlaces.map((dp) => (dp.id === id ? newDp : dp)), sections: newSections };
    });
  },

  importDutyPlaces: async (dps) => {
    const rows = dps.map((dp) => ({
      name: dp.name,
      section_id: dp.sectionId || null,
      type: (dp.isSpecial ? 'special' : 'classroom') as 'classroom' | 'special' | 'inspection',
      mandatory_slots: dp.minPrefects ?? (dp.isMandatory ? 1 : 0),
      max_prefects: dp.maxPrefects || 1,
      required_gender_balance: dp.requiredGenderBalance || false,
    }));
    const { data, error } = await supabase.from('duty_places').insert(rows).select();
    if (error || !data) { console.error(error); return; }
    const newDps: DutyPlace[] = data.map((d) => ({
      id: d.id, name: d.name, sectionId: d.section_id || '',
      isSpecial: d.type === 'special' || d.type === 'inspection',
      isMandatory: d.mandatory_slots > 0,
      requiredGenderBalance: d.required_gender_balance,
      maxPrefects: d.max_prefects,
      minPrefects: d.mandatory_slots,
      genderRequirement: d.gender_requirement || undefined,
      gradeRequirement: d.grade_requirement || undefined,
      sameGradeIfMultiple: d.same_grade_if_multiple,
      mandatorySlots: d.mandatory_slots,
    }));
    set((s) => ({
      dutyPlaces: [...s.dutyPlaces, ...newDps],
      sections: s.sections.map((sec) => {
        const newIds = newDps.filter((dp) => dp.sectionId === sec.id).map((dp) => dp.id);
        return newIds.length > 0 ? { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, ...newIds] } : sec;
      }),
    }));
  },

  getDutyCount: (prefectId: string) => {
    const s = get();
    let count = s.assignments.filter((a) => a.prefectId === prefectId).length;
    s.sections.forEach((sec) => {
      if (sec.headId === prefectId) count++;
      if (sec.coHeadId === prefectId) count++;
    });
    return count;
  },

  assignPrefect: (prefectId, dutyPlaceId, sectionId) => {
    const state = get();
    const prefect = state.prefects.find((p) => p.id === prefectId);
    if (!prefect) return 'Prefect not found';
    if (prefect.isHeadPrefect) return 'Head Prefect is excluded from duty assignments';
    if (prefect.isDeputyHeadPrefect) return 'Deputy Head Prefect is excluded from duty assignments';
    if (state.assignments.find((a) => a.prefectId === prefectId)) return 'Prefect is already assigned to a duty. Remove existing assignment first.';
    if (state.sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId)) return 'Prefect is a section head/co-head. Remove leadership role first.';
    const dp = state.dutyPlaces.find((d) => d.id === dutyPlaceId);
    if (!dp) return 'Duty place not found';
    const currentCount = state.assignments.filter((a) => a.dutyPlaceId === dutyPlaceId).length;
    if (currentCount >= (dp.maxPrefects || 1)) return `Max ${dp.maxPrefects || 1} prefects for this duty`;

    const assignment: Assignment = { id: generateId(), prefectId, dutyPlaceId, sectionId };
    set((s) => ({ assignments: [...s.assignments, assignment] }));
    supabase.from('assignments').insert({ id: assignment.id, prefect_id: prefectId, duty_place_id: dutyPlaceId, assigned_by: 'manual' })
      .then(({ error }) => { if (error) console.error('DB assignment insert error:', error); });
    return null;
  },

  removeAssignment: async (assignmentId) => {
    await supabase.from('assignments').delete().eq('id', assignmentId);
    set((s) => ({ assignments: s.assignments.filter((a) => a.id !== assignmentId) }));
  },

  swapAssignments: (a1Id, a2Id) => {
    set((s) => {
      const a1 = s.assignments.find((a) => a.id === a1Id);
      const a2 = s.assignments.find((a) => a.id === a2Id);
      if (!a1 || !a2) return s;
      return { assignments: s.assignments.map((a) => {
        if (a.id === a1Id) return { ...a, prefectId: a2.prefectId };
        if (a.id === a2Id) return { ...a, prefectId: a1.prefectId };
        return a;
      }) };
    });
  },

  clearAllAssignments: async () => {
    await supabase.from('assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const state = get();
    for (const sec of state.sections) {
      if (sec.headId || sec.coHeadId) {
        await supabase.from('sections').update({ head_prefect_id: null, co_head_prefect_id: null }).eq('id', sec.id);
      }
    }
    set((s) => ({ assignments: [], sections: s.sections.map((sec) => ({ ...sec, headId: undefined, coHeadId: undefined })) }));
  },

  autoAssign: () => {
    const report: AutoAssignReport = { assigned: 0, skipped: 0, vacancies: [], violations: [] };

    const getDutyCount = (prefectId: string): number => {
      const s = get();
      let count = s.assignments.filter((a) => a.prefectId === prefectId).length;
      s.sections.forEach((sec) => { if (sec.headId === prefectId) count++; if (sec.coHeadId === prefectId) count++; });
      return count;
    };

    const pickBest = (candidates: Prefect[]): Prefect | undefined => {
      if (candidates.length === 0) return undefined;
      return [...candidates].sort((a, b) => getDutyCount(a.id) - getDutyCount(b.id))[0];
    };

    const isAssigned = (prefectId: string): boolean => getDutyCount(prefectId) > 0;

    const getPool = (filter?: { gender?: Gender; minGrade?: number; onlyUnassigned?: boolean }) => {
      return get().prefects.filter((p) => {
        if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
        if (filter?.gender && p.gender !== filter.gender) return false;
        if (filter?.minGrade && p.grade < filter.minGrade) return false;
        if (filter?.onlyUnassigned && isAssigned(p.id)) return false;
        return true;
      });
    };

    // Phase 1: Section Heads
    for (const section of get().sections) {
      if (section.headId) continue;
      const sectionGrade = getSectionGrade(section.name);
      const candidates = getPool({ gender: 'Male', onlyUnassigned: true }).filter((p) => sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8);
      const best = pickBest(candidates) || pickBest(getPool({ onlyUnassigned: true }).filter((p) => sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8));
      if (best) { get().setSectionHead(section.id, best.id); report.assigned++; }
      else { report.skipped++; report.vacancies.push({ placeName: `${section.name} Head`, slotsNeeded: 1 }); }
    }

    // Phase 2: Co-Section Heads
    for (const section of get().sections) {
      if (section.coHeadId) continue;
      const sectionGrade = getSectionGrade(section.name);
      const candidates = getPool({ gender: 'Female', onlyUnassigned: true }).filter((p) => {
        if (get().sections.some((s) => s.headId === p.id)) return false;
        return sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8;
      });
      const best = pickBest(candidates) || pickBest(getPool({ onlyUnassigned: true }).filter((p) => {
        if (get().sections.some((s) => s.headId === p.id)) return false;
        return sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8;
      }));
      if (best) { get().setSectionCoHead(section.id, best.id); report.assigned++; }
      else { report.skipped++; report.vacancies.push({ placeName: `${section.name} Co-Head`, slotsNeeded: 1 }); }
    }

    // Phase 3: Special duties
    const specialOrder = ['Main Gate (Gate A)', 'Shine Room', 'Gate B', 'Ground', 'Rock Plateau', 'Prefect Duty Inspection'];
    const specialPlaces = specialOrder.map((name) => get().dutyPlaces.find((dp) => dp.name === name)).filter(Boolean) as DutyPlace[];
    get().dutyPlaces.filter((dp) => dp.isSpecial && !specialOrder.includes(dp.name)).forEach((dp) => specialPlaces.push(dp));

    for (const dp of specialPlaces) {
      const maxSlots = dp.maxPrefects || 1;
      const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
      let slotsToFill = maxSlots - currentAssignments.length;
      if (slotsToFill <= 0) continue;

      const genderReq = dp.genderRequirement;
      const gradeReqStr = dp.gradeRequirement;
      const minGrade = gradeReqStr ? Math.min(...gradeReqStr.split(',').map(Number)) : 10;
      const genderFilter = genderReq === 'M' ? 'Male' : genderReq === 'F' ? 'Female' : undefined;

      for (let i = 0; i < slotsToFill; i++) {
        if (dp.requiredGenderBalance) {
          // Alternate genders
          const currentMales = get().assignments.filter((a) => a.dutyPlaceId === dp.id).filter((a) => get().prefects.find((pr) => pr.id === a.prefectId)?.gender === 'Male').length;
          const currentFemales = get().assignments.filter((a) => a.dutyPlaceId === dp.id).length - currentMales;
          const needGender = currentMales <= currentFemales ? 'Male' : 'Female';
          const best = pickBest(getPool({ gender: needGender, minGrade, onlyUnassigned: true }));
          if (best) { const err = get().assignPrefect(best.id, dp.id, dp.sectionId); if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); } }
          else { report.vacancies.push({ placeName: `${dp.name} (${needGender})`, slotsNeeded: 1 }); }
        } else {
          const best = pickBest(getPool({ gender: genderFilter, minGrade, onlyUnassigned: true }));
          if (best) { const err = get().assignPrefect(best.id, dp.id, dp.sectionId); if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); } }
          else { report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 }); }
        }
      }
    }

    // Phase 4: Classroom duties
    {
      const classPlaces = get().dutyPlaces.filter((dp) => !dp.isSpecial).sort((a, b) => (getClassGrade(b.name) || 0) - (getClassGrade(a.name) || 0));
      let unassignedPool = getPool({ onlyUnassigned: true });
      let assignedThisRound = true;
      while (assignedThisRound && unassignedPool.length > 0) {
        assignedThisRound = false;
        for (const dp of classPlaces) {
          if (unassignedPool.length === 0) break;
          const classGrade = getClassGrade(dp.name);
          if (!classGrade) continue;
          const currentCount = get().assignments.filter((a) => a.dutyPlaceId === dp.id).length;
          const max = dp.maxPrefects || 1;
          if (currentCount >= max) continue;

          const eligible = unassignedPool.filter((p) => {
            if (get().assignments.some((a) => a.prefectId === p.id)) return false;
            if (classGrade >= 11) return p.grade === 11;
            if (p.grade <= classGrade) return false;
            return true;
          });
          const best = pickBest(eligible);
          if (best) {
            const newAssignment: Assignment = { id: generateId(), prefectId: best.id, dutyPlaceId: dp.id, sectionId: dp.sectionId };
            set((s) => ({ assignments: [...s.assignments, newAssignment] }));
            supabase.from('assignments').insert({ id: newAssignment.id, prefect_id: best.id, duty_place_id: dp.id, assigned_by: 'auto' })
              .then(({ error }) => { if (error) console.error(error); });
            report.assigned++;
            assignedThisRound = true;
            unassignedPool = getPool({ onlyUnassigned: true });
          } else if (dp.isMandatory && currentCount === 0) {
            report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 });
          }
        }
      }
    }

    return report;
  },

  validate: () => {
    const state = get();
    const issues: ValidationIssue[] = [];

    for (const assignment of state.assignments) {
      const prefect = state.prefects.find((p) => p.id === assignment.prefectId);
      const dp = state.dutyPlaces.find((d) => d.id === assignment.dutyPlaceId);
      if (!prefect || !dp) continue;
      const classGrade = getClassGrade(dp.name);
      if (classGrade) {
        if (classGrade >= 11 && prefect.grade !== 11) {
          issues.push({ type: 'error', category: 'grade_mismatch', message: `${prefect.name} (Grade ${prefect.grade}) assigned to ${dp.name} — only Grade 11 allowed`, prefectId: prefect.id, dutyPlaceId: dp.id });
        } else if (prefect.grade <= classGrade && classGrade < 11) {
          issues.push({ type: 'error', category: 'grade_mismatch', message: `${prefect.name} (Grade ${prefect.grade}) cannot be assigned to ${dp.name} — must be senior`, prefectId: prefect.id, dutyPlaceId: dp.id });
        }
        if (prefect.grade === classGrade && prefect.grade !== 11) {
          issues.push({ type: 'error', category: 'same_age', message: `${prefect.name} (Grade ${prefect.grade}) same grade as ${dp.name}`, prefectId: prefect.id, dutyPlaceId: dp.id });
        }
      }
    }

    // Double assignments
    const prefectAssignmentCount: Record<string, number> = {};
    for (const a of state.assignments) { prefectAssignmentCount[a.prefectId] = (prefectAssignmentCount[a.prefectId] || 0) + 1; }
    for (const [pid, count] of Object.entries(prefectAssignmentCount)) {
      if (count > 1) {
        const p = state.prefects.find((pr) => pr.id === pid);
        if (p) issues.push({ type: 'error', category: 'single_duty', message: `${p.name} is assigned to ${count} duties — only 1 allowed`, prefectId: pid });
      }
    }

    // Gender balance
    for (const dp of state.dutyPlaces.filter((dp) => dp.requiredGenderBalance)) {
      const dpAssignments = state.assignments.filter((a) => a.dutyPlaceId === dp.id);
      if (dpAssignments.length >= 2) {
        const genders = dpAssignments.map((a) => state.prefects.find((pr) => pr.id === a.prefectId)?.gender);
        if (!genders.includes('Male') || !genders.includes('Female')) {
          issues.push({ type: 'warning', category: 'gender_violation', message: `${dp.name} requires gender balance`, dutyPlaceId: dp.id });
        }
      }
    }

    // Below minimum
    for (const dp of state.dutyPlaces) {
      const min = dp.minPrefects ?? 0;
      if (min <= 0) continue;
      const count = state.assignments.filter((a) => a.dutyPlaceId === dp.id).length;
      if (count < min) {
        issues.push({ type: 'warning', category: 'below_minimum', message: `${dp.name} has ${count}/${min} minimum prefects assigned`, dutyPlaceId: dp.id });
      }
    }

    // Section heads
    for (const section of state.sections) {
      if (!section.headId) issues.push({ type: 'warning', category: 'vacant_mandatory', message: `${section.name} has no Section Head` });
      if (!section.coHeadId) issues.push({ type: 'warning', category: 'vacant_mandatory', message: `${section.name} has no Co-Section Head` });
    }

    return issues;
  },

  getPrefectDuty: (prefectId) => get().assignments.find((a) => a.prefectId === prefectId),
  getAssignedPrefect: (dutyPlaceId) => get().assignments.filter((a) => a.dutyPlaceId === dutyPlaceId),

  getAvailablePrefects: () => {
    const state = get();
    return state.prefects
      .filter((p) => {
        if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
        if (state.assignments.some((a) => a.prefectId === p.id)) return false;
        if (state.sections.some((s) => s.headId === p.id || s.coHeadId === p.id)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  isSectionHeadOrCoHead: (prefectId) => get().sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId),
}));
