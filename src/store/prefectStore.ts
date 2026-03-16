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

  // Data loading
  loadFromDB: () => Promise<void>;

  // Prefect actions
  addPrefect: (p: Omit<Prefect, 'id' | 'level'>) => Promise<void>;
  updatePrefect: (id: string, p: Partial<Prefect>) => Promise<void>;
  removePrefect: (id: string) => Promise<string | null>;
  importPrefects: (prefects: Omit<Prefect, 'id' | 'level'>[]) => Promise<void>;

  // Section actions
  addSection: (name: string) => Promise<void>;
  removeSection: (id: string) => Promise<void>;
  renameSection: (id: string, name: string) => Promise<void>;
  setSectionHead: (sectionId: string, prefectId: string | undefined) => Promise<void>;
  setSectionCoHead: (sectionId: string, prefectId: string | undefined) => Promise<void>;

  // Duty place actions
  addDutyPlace: (dp: Omit<DutyPlace, 'id'>) => Promise<void>;
  removeDutyPlace: (id: string) => Promise<void>;
  updateDutyPlace: (id: string, dp: Partial<DutyPlace>) => Promise<void>;

  // Assignment actions
  assignPrefect: (prefectId: string, dutyPlaceId: string, sectionId: string) => string | null;
  removeAssignment: (assignmentId: string) => Promise<void>;
  swapAssignments: (a1Id: string, a2Id: string) => void;
  clearAllAssignments: () => Promise<void>;
  autoAssign: () => AutoAssignReport;

  // Validation
  validate: () => ValidationIssue[];

  // Helpers
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
  return prefectGrade === 11; // grades 9, 10, 11
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
      name: p.name,
      reg_number: p.regNo,
      grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: p.isHeadPrefect ? 'head_prefect' : p.isDeputyHeadPrefect ? 'deputy_head_prefect' : 'prefect',
    }).select().single();

    if (error) { console.error(error); return; }
    if (!data) return;

    const prefect: Prefect = {
      id: data.id,
      name: data.name,
      regNo: data.reg_number,
      grade: data.grade,
      gender: p.gender,
      level: calculateLevel(data.grade),
      isHeadPrefect: data.role === 'head_prefect',
      isDeputyHeadPrefect: data.role === 'deputy_head_prefect',
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
        p.id === id
          ? { ...p, ...updates, level: updates.grade ? calculateLevel(updates.grade) : p.level }
          : p
      ),
    }));
  },

  removePrefect: async (id) => {
    // Check if prefect has assignments (ON DELETE RESTRICT will block)
    const state = get();
    const hasAssignment = state.assignments.some((a) => a.prefectId === id);
    const isLeader = state.sections.some((s) => s.headId === id || s.coHeadId === id);

    if (hasAssignment || isLeader) {
      return 'Cannot delete: prefect has active assignments or leadership roles. Remove those first.';
    }

    const { error } = await supabase.from('prefects').update({ active: false }).eq('id', id);
    if (error) return 'Failed to remove prefect: ' + error.message;

    set((s) => ({ prefects: s.prefects.filter((p) => p.id !== id) }));
    return null;
  },

  importPrefects: async (prefects) => {
    const rows = prefects.map((p) => ({
      name: p.name,
      reg_number: p.regNo,
      grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: (p.isHeadPrefect ? 'head_prefect' : p.isDeputyHeadPrefect ? 'deputy_head_prefect' : 'prefect') as 'prefect' | 'head_prefect' | 'deputy_head_prefect',
    }));

    const { data, error } = await supabase.from('prefects').insert(rows).select();
    if (error) { console.error(error); return; }
    if (!data) return;

    const newPrefects: Prefect[] = data.map((d) => ({
      id: d.id,
      name: d.name,
      regNo: d.reg_number,
      grade: d.grade,
      gender: (d.gender === 'M' ? 'Male' : 'Female') as Gender,
      level: calculateLevel(d.grade),
      isHeadPrefect: d.role === 'head_prefect',
      isDeputyHeadPrefect: d.role === 'deputy_head_prefect',
    }));
    set((s) => ({ prefects: [...s.prefects, ...newPrefects] }));
  },

  addSection: async (name) => {
    const { data, error } = await supabase.from('sections').insert({ name }).select().single();
    if (error || !data) return;
    set((s) => ({ sections: [...s.sections, { id: data.id, name: data.name, dutyPlaceIds: [] }] }));
  },

  removeSection: async (id) => {
    await supabase.from('sections').delete().eq('id', id);
    set((s) => ({
      sections: s.sections.filter((sec) => sec.id !== id),
      dutyPlaces: s.dutyPlaces.filter((dp) => dp.sectionId !== id),
      assignments: s.assignments.filter((a) => a.sectionId !== id),
    }));
  },

  setSectionHead: async (sectionId, prefectId) => {
    await supabase.from('sections').update({ head_prefect_id: prefectId || null }).eq('id', sectionId);
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, headId: prefectId } : sec
      ),
    }));
  },

  setSectionCoHead: async (sectionId, prefectId) => {
    await supabase.from('sections').update({ co_head_prefect_id: prefectId || null }).eq('id', sectionId);
    set((s) => ({
      sections: s.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, coHeadId: prefectId } : sec
      ),
    }));
  },

  addDutyPlace: async (dp) => {
    const { data, error } = await supabase.from('duty_places').insert({
      name: dp.name,
      section_id: dp.sectionId || null,
      type: dp.isSpecial ? 'special' : 'classroom',
      mandatory_slots: dp.isMandatory ? 1 : 0,
      max_prefects: dp.maxPrefects || 1,
      required_gender_balance: dp.requiredGenderBalance || false,
    }).select().single();

    if (error || !data) return;
    const newDp: DutyPlace = { ...dp, id: data.id };
    set((s) => ({
      dutyPlaces: [...s.dutyPlaces, newDp],
      sections: s.sections.map((sec) =>
        sec.id === dp.sectionId ? { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, data.id] } : sec
      ),
    }));
  },

  removeDutyPlace: async (id) => {
    await supabase.from('duty_places').delete().eq('id', id);
    set((s) => ({
      dutyPlaces: s.dutyPlaces.filter((dp) => dp.id !== id),
      assignments: s.assignments.filter((a) => a.dutyPlaceId !== id),
      sections: s.sections.map((sec) => ({
        ...sec,
        dutyPlaceIds: sec.dutyPlaceIds.filter((dpId) => dpId !== id),
      })),
    }));
  },

  updateDutyPlace: async (id, updates) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.maxPrefects !== undefined) dbUpdates.max_prefects = updates.maxPrefects;
    await supabase.from('duty_places').update(dbUpdates).eq('id', id);
    set((s) => ({
      dutyPlaces: s.dutyPlaces.map((dp) => (dp.id === id ? { ...dp, ...updates } : dp)),
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
    if (prefect.isHeadPrefect) return 'Head Prefect excluded from normal duty';

    // Check duplicate assignment to same duty place
    const duplicate = state.assignments.find((a) => a.prefectId === prefectId && a.dutyPlaceId === dutyPlaceId);
    if (duplicate) return 'Prefect already assigned to this duty place';

    const dp = state.dutyPlaces.find((d) => d.id === dutyPlaceId);
    if (!dp) return 'Duty place not found';

    // Max prefects check
    const currentCount = state.assignments.filter((a) => a.dutyPlaceId === dutyPlaceId).length;
    if (currentCount >= (dp.maxPrefects || 1)) return `Max ${dp.maxPrefects || 1} prefects for this duty`;

    // Single-duty warning (manual override allowed)
    const existingDutyCount = state.getDutyCount(prefectId);
    if (existingDutyCount > 0) {
      // Allow but warn — manual assignment permits multiple
    }

    const assignment: Assignment = { id: generateId(), prefectId, dutyPlaceId, sectionId };
    set((s) => ({ assignments: [...s.assignments, assignment] }));

    // Async DB insert (fire-and-forget for UI responsiveness)
    supabase.from('assignments').insert({
      id: assignment.id,
      prefect_id: prefectId,
      duty_place_id: dutyPlaceId,
      assigned_by: 'manual',
    }).then(({ error }) => { if (error) console.error('DB assignment insert error:', error); });

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
      return {
        assignments: s.assignments.map((a) => {
          if (a.id === a1Id) return { ...a, prefectId: a2.prefectId };
          if (a.id === a2Id) return { ...a, prefectId: a1.prefectId };
          return a;
        }),
      };
    });
  },

  clearAllAssignments: async () => {
    await supabase.from('assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Also clear section heads/co-heads
    const state = get();
    for (const sec of state.sections) {
      if (sec.headId || sec.coHeadId) {
        await supabase.from('sections').update({ head_prefect_id: null, co_head_prefect_id: null }).eq('id', sec.id);
      }
    }
    set((s) => ({
      assignments: [],
      sections: s.sections.map((sec) => ({ ...sec, headId: undefined, coHeadId: undefined })),
    }));
  },

  autoAssign: () => {
    const report: AutoAssignReport = { assigned: 0, skipped: 0, vacancies: [], violations: [] };

    const getDutyCount = (prefectId: string): number => {
      const s = get();
      let count = s.assignments.filter((a) => a.prefectId === prefectId).length;
      s.sections.forEach((sec) => {
        if (sec.headId === prefectId) count++;
        if (sec.coHeadId === prefectId) count++;
      });
      return count;
    };

    const pickBest = (candidates: Prefect[]): Prefect | undefined => {
      if (candidates.length === 0) return undefined;
      const sorted = [...candidates].sort((a, b) => getDutyCount(a.id) - getDutyCount(b.id));
      return sorted[0];
    };

    const isAssigned = (prefectId: string): boolean => getDutyCount(prefectId) > 0;

    const getPool = (filter?: { gender?: Gender; minGrade?: number; excludeHP?: boolean; onlyUnassigned?: boolean }) => {
      return get().prefects.filter((p) => {
        if (p.isHeadPrefect && filter?.excludeHP !== false) return false;
        if (filter?.gender && p.gender !== filter.gender) return false;
        if (filter?.minGrade && p.grade < filter.minGrade) return false;
        if (filter?.onlyUnassigned && isAssigned(p.id)) return false;
        return true;
      });
    };

    // ===== PHASE 1: Section Heads (male priority) =====
    for (const section of get().sections) {
      if (section.headId) continue;
      const sectionGrade = getSectionGrade(section.name);

      const tryAssignHead = (genderFilter?: Gender, unassignedOnly?: boolean) => {
        const candidates = getPool({
          gender: genderFilter,
          excludeHP: true,
          onlyUnassigned: unassignedOnly,
        }).filter((p) => {
          if (p.isDeputyHeadPrefect) return true; // Deputies can be heads
          if (sectionGrade) return isEligibleHead(p.grade, sectionGrade);
          return p.grade >= 8; // Non-grade sections
        });
        return pickBest(candidates);
      };

      // Try: male unassigned → any unassigned (single-duty rule: never assign already-assigned)
      const best = tryAssignHead('Male', true) || tryAssignHead(undefined, true);
      if (best) {
        get().setSectionHead(section.id, best.id);
        report.assigned++;
      } else {
        report.skipped++;
        report.vacancies.push({ placeName: `${section.name} Head`, slotsNeeded: 1 });
      }
    }

    // ===== PHASE 2: Co-Section Heads (female priority) =====
    for (const section of get().sections) {
      if (section.coHeadId) continue;
      const sectionGrade = getSectionGrade(section.name);

      const tryAssignCoHead = (genderFilter?: Gender, unassignedOnly?: boolean) => {
        const candidates = getPool({
          gender: genderFilter,
          excludeHP: true,
          onlyUnassigned: unassignedOnly,
        }).filter((p) => {
          if (p.isHeadPrefect) return false;
          // Don't pick someone already a section head
          if (get().sections.some((s) => s.headId === p.id)) return false;
          if (sectionGrade) return isEligibleHead(p.grade, sectionGrade);
          return p.grade >= 8;
        });
        return pickBest(candidates);
      };

      // Single-duty rule: only unassigned prefects
      const best = tryAssignCoHead('Female', true) || tryAssignCoHead(undefined, true);
      if (best) {
        get().setSectionCoHead(section.id, best.id);
        report.assigned++;
      } else {
        report.skipped++;
        report.vacancies.push({ placeName: `${section.name} Co-Head`, slotsNeeded: 1 });
      }
    }

    // ===== PHASE 3: Special duties =====
    const specialOrder = ['Main Gate (Gate A)', 'Shine Room', 'Gate B', 'Ground', 'Rock Plateau', 'Prefect Duty Inspection'];
    const specialPlaces = specialOrder
      .map((name) => get().dutyPlaces.find((dp) => dp.name === name))
      .filter(Boolean) as DutyPlace[];

    // Add any other special places not in the explicit order
    get().dutyPlaces.filter((dp) => dp.isSpecial && !specialOrder.includes(dp.name)).forEach((dp) => specialPlaces.push(dp));

    for (const dp of specialPlaces) {
      const maxSlots = dp.maxPrefects || 1;
      const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
      let slotsToFill = maxSlots - currentAssignments.length;
      if (slotsToFill <= 0) continue;

      // Main Gate special composition: 2 boys + 2 girls Grade 11
      if (dp.name === 'Main Gate (Gate A)') {
        const currentMales = currentAssignments.filter((a) => {
          const p = get().prefects.find((pr) => pr.id === a.prefectId);
          return p?.gender === 'Male';
        }).length;
        const currentFemales = currentAssignments.length - currentMales;

        const malesNeeded = Math.max(0, 2 - currentMales);
        const femalesNeeded = Math.max(0, 2 - currentFemales);

        for (let i = 0; i < malesNeeded; i++) {
          const best = pickBest(getPool({ gender: 'Male', minGrade: 11, onlyUnassigned: true }));
          if (best) {
            const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
          } else {
            report.vacancies.push({ placeName: `${dp.name} (Male)`, slotsNeeded: 1 });
          }
        }
        for (let i = 0; i < femalesNeeded; i++) {
          const best = pickBest(getPool({ gender: 'Female', minGrade: 11, onlyUnassigned: true }));
          if (best) {
            const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
          } else {
            report.vacancies.push({ placeName: `${dp.name} (Female)`, slotsNeeded: 1 });
          }
        }
        continue;
      }

      // Gender-specific special duties
      const genderReq = (dp as any).genderRequirement as string | undefined;
      const gradeReqStr = (dp as any).gradeRequirement as string | undefined;
      const minGrade = gradeReqStr ? Math.min(...gradeReqStr.split(',').map(Number)) : 10;
      const genderFilter = genderReq === 'M' ? 'Male' : genderReq === 'F' ? 'Female' : undefined;

      for (let i = 0; i < slotsToFill; i++) {
        // Same-grade-if-multiple check
        if ((dp as any).sameGradeIfMultiple && currentAssignments.length > 0) {
          const existingPrefect = get().prefects.find((p) => p.id === currentAssignments[0].prefectId);
          if (existingPrefect) {
            const sameGradeCandidates = getPool({ gender: genderFilter, minGrade, onlyUnassigned: true })
              .filter((p) => p.grade === existingPrefect.grade && !get().assignments.some((a) => a.prefectId === p.id && a.dutyPlaceId === dp.id));
            const best = pickBest(sameGradeCandidates);
            if (best) {
              const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
              if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
            } else {
              report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 });
            }
            continue;
          }
        }

        // Single-duty rule: only unassigned prefects
        const best = pickBest(getPool({ gender: genderFilter, minGrade, onlyUnassigned: true })
          .filter((p) => !get().assignments.some((a) => a.prefectId === p.id && a.dutyPlaceId === dp.id)));
        if (best) {
          const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
          if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
        } else {
          report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 });
        }
      }
    }

    // ===== PHASE 4: Classroom duties — round-robin distribution =====
    // Single-duty rule: only assign prefects with zero duties
    {
      const classPlaces = get().dutyPlaces
        .filter((dp) => !dp.isSpecial)
        .sort((a, b) => {
          const gA = getClassGrade(a.name) || 0;
          const gB = getClassGrade(b.name) || 0;
          return gB - gA; // Grade 11 first
        });

      // Collect all unassigned prefects (excluding Head Prefects)
      let unassignedPool = getPool({ excludeHP: true, onlyUnassigned: true });

      // Round-robin: cycle through classrooms, assign one per classroom per round
      let assignedThisRound = true;
      while (assignedThisRound && unassignedPool.length > 0) {
        assignedThisRound = false;
        for (const dp of classPlaces) {
          if (unassignedPool.length === 0) break;

          const classGrade = getClassGrade(dp.name);
          if (!classGrade) continue;

          // Find eligible candidates for this classroom
          const eligible = unassignedPool.filter((p) => {
            if (get().assignments.some((a) => a.prefectId === p.id && a.dutyPlaceId === dp.id)) return false;
            if (classGrade >= 11) return p.grade === 11;
            if (p.grade <= classGrade) return false;
            return true;
          });

          const best = pickBest(eligible);
          if (best) {
            // Bypass maxPrefects for round-robin — directly create assignment
            const newAssignment: Assignment = {
              id: generateId(),
              prefectId: best.id,
              dutyPlaceId: dp.id,
              sectionId: dp.sectionId,
            };
            set((s) => ({ assignments: [...s.assignments, newAssignment] }));
            report.assigned++;
            assignedThisRound = true;
            // Refresh unassigned pool after each assignment
            unassignedPool = getPool({ excludeHP: true, onlyUnassigned: true });
          } else if (dp.isMandatory && get().assignments.filter((a) => a.dutyPlaceId === dp.id).length === 0) {
            report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 });
          }
        }
      }
    }

    // Phase 4 round-robin already ensures no prefect is left without a duty.
    // Any remaining unassigned prefects couldn't fit due to grade restrictions.

    return report;
  },

  validate: () => {
    const state = get();
    const issues: ValidationIssue[] = [];

    // Check assignments for grade mismatches
    for (const assignment of state.assignments) {
      const prefect = state.prefects.find((p) => p.id === assignment.prefectId);
      const dp = state.dutyPlaces.find((d) => d.id === assignment.dutyPlaceId);
      if (!prefect || !dp) continue;

      const classGrade = getClassGrade(dp.name);
      if (classGrade) {
        if (classGrade >= 11) {
          if (prefect.grade !== 11) {
            issues.push({
              type: 'error', category: 'grade_mismatch',
              message: `${prefect.name} (Grade ${prefect.grade}) assigned to ${dp.name} — only Grade 11 allowed`,
              prefectId: prefect.id, dutyPlaceId: dp.id,
            });
          }
        } else if (prefect.grade <= classGrade) {
          issues.push({
            type: 'error', category: 'grade_mismatch',
            message: `${prefect.name} (Grade ${prefect.grade}) cannot be assigned to ${dp.name} — must be senior`,
            prefectId: prefect.id, dutyPlaceId: dp.id,
          });
        }

        if (prefect.grade === classGrade && prefect.grade !== 11) {
          issues.push({
            type: 'error', category: 'same_age',
            message: `${prefect.name} (Grade ${prefect.grade}) same grade as ${dp.name}`,
            prefectId: prefect.id, dutyPlaceId: dp.id,
          });
        }
      }
    }

    // Gender balance check for special duties
    const specialDps = state.dutyPlaces.filter((dp) => dp.requiredGenderBalance);
    for (const dp of specialDps) {
      const dpAssignments = state.assignments.filter((a) => a.dutyPlaceId === dp.id);
      if (dpAssignments.length >= 2) {
        const genders = dpAssignments.map((a) => {
          const p = state.prefects.find((pr) => pr.id === a.prefectId);
          return p?.gender;
        });
        if (!genders.includes('Male') || !genders.includes('Female')) {
          issues.push({
            type: 'warning', category: 'gender_violation',
            message: `${dp.name} requires gender balance`, dutyPlaceId: dp.id,
          });
        }
      }
    }

    // Vacant mandatory slots
    const mandatoryDps = state.dutyPlaces.filter((dp) => dp.isMandatory);
    for (const dp of mandatoryDps) {
      const dpAssignments = state.assignments.filter((a) => a.dutyPlaceId === dp.id);
      if (dpAssignments.length === 0) {
        issues.push({
          type: 'warning', category: 'vacant_mandatory',
          message: `${dp.name} (mandatory) has no prefect assigned`, dutyPlaceId: dp.id,
        });
      }
    }

    // Sections without head/co-head
    for (const section of state.sections) {
      if (!section.headId) {
        issues.push({ type: 'warning', category: 'vacant_mandatory', message: `${section.name} has no Section Head` });
      }
      if (!section.coHeadId) {
        issues.push({ type: 'warning', category: 'vacant_mandatory', message: `${section.name} has no Co-Section Head` });
      }
    }

    return issues;
  },

  getPrefectDuty: (prefectId) => get().assignments.find((a) => a.prefectId === prefectId),

  getAssignedPrefect: (dutyPlaceId) => get().assignments.filter((a) => a.dutyPlaceId === dutyPlaceId),

  getAvailablePrefects: () => {
    const state = get();
    const dutyCount = (id: string) => {
      let c = state.assignments.filter((a) => a.prefectId === id).length;
      state.sections.forEach((sec) => {
        if (sec.headId === id) c++;
        if (sec.coHeadId === id) c++;
      });
      return c;
    };
    return state.prefects
      .filter((p) => !p.isHeadPrefect)
      .sort((a, b) => dutyCount(a.id) - dutyCount(b.id));
  },

  isSectionHeadOrCoHead: (prefectId) => {
    return get().sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId);
  },
}));
