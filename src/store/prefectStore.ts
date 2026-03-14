import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Prefect, Section, DutyPlace, Assignment, ValidationIssue,
  generateId, calculateLevel, DEFAULT_SECTIONS, DEFAULT_DUTY_PLACES, Gender,
} from '@/types/prefect';

interface PrefectStore {
  prefects: Prefect[];
  sections: Section[];
  dutyPlaces: DutyPlace[];
  assignments: Assignment[];

  // Prefect actions
  addPrefect: (p: Omit<Prefect, 'id' | 'level'>) => void;
  updatePrefect: (id: string, p: Partial<Prefect>) => void;
  removePrefect: (id: string) => void;
  importPrefects: (prefects: Omit<Prefect, 'id' | 'level'>[]) => void;

  // Section actions
  addSection: (name: string) => void;
  removeSection: (id: string) => void;
  setSectionHead: (sectionId: string, prefectId: string | undefined) => void;
  setSectionCoHead: (sectionId: string, prefectId: string | undefined) => void;

  // Duty place actions
  addDutyPlace: (dp: Omit<DutyPlace, 'id'>) => void;
  removeDutyPlace: (id: string) => void;
  updateDutyPlace: (id: string, dp: Partial<DutyPlace>) => void;

  // Assignment actions
  assignPrefect: (prefectId: string, dutyPlaceId: string, sectionId: string) => string | null;
  removeAssignment: (assignmentId: string) => void;
  swapAssignments: (a1Id: string, a2Id: string) => void;
  clearAllAssignments: () => void;
  autoAssign: () => { assigned: number; skipped: number };

  // Validation
  validate: () => ValidationIssue[];

  // Helpers
  getPrefectDuty: (prefectId: string) => Assignment | undefined;
  getAssignedPrefect: (dutyPlaceId: string) => Assignment[];
  getAvailablePrefects: () => Prefect[];
  isSectionHeadOrCoHead: (prefectId: string) => boolean;
}

function initDutyPlaces(): DutyPlace[] {
  return DEFAULT_DUTY_PLACES.map((dp) => ({ ...dp, id: generateId() }));
}

function initSections(dutyPlaces: DutyPlace[]): Section[] {
  return DEFAULT_SECTIONS.map((s) => ({
    ...s,
    dutyPlaceIds: dutyPlaces.filter((dp) => dp.sectionId === s.id).map((dp) => dp.id),
  }));
}

const initialDutyPlaces = initDutyPlaces();
const initialSections = initSections(initialDutyPlaces);

function getClassGrade(dutyPlaceName: string): number | null {
  const match = dutyPlaceName.match(/^(\d+)[A-E]$/);
  return match ? parseInt(match[1]) : null;
}

export const usePrefectStore = create<PrefectStore>()(
  persist(
    (set, get) => ({
      prefects: [],
      sections: initialSections,
      dutyPlaces: initialDutyPlaces,
      assignments: [],

      addPrefect: (p) => {
        const prefect: Prefect = { ...p, id: generateId(), level: calculateLevel(p.grade) };
        set((s) => ({ prefects: [...s.prefects, prefect] }));
      },

      updatePrefect: (id, updates) => {
        set((s) => ({
          prefects: s.prefects.map((p) =>
            p.id === id
              ? { ...p, ...updates, level: updates.grade ? calculateLevel(updates.grade) : p.level }
              : p
          ),
        }));
      },

      removePrefect: (id) => {
        set((s) => ({
          prefects: s.prefects.filter((p) => p.id !== id),
          assignments: s.assignments.filter((a) => a.prefectId !== id),
          sections: s.sections.map((sec) => ({
            ...sec,
            headId: sec.headId === id ? undefined : sec.headId,
            coHeadId: sec.coHeadId === id ? undefined : sec.coHeadId,
          })),
        }));
      },

      importPrefects: (prefects) => {
        const newPrefects = prefects.map((p) => ({
          ...p,
          id: generateId(),
          level: calculateLevel(p.grade),
        }));
        set((s) => ({ prefects: [...s.prefects, ...newPrefects] }));
      },

      addSection: (name) => {
        const id = generateId();
        set((s) => ({ sections: [...s.sections, { id, name, dutyPlaceIds: [] }] }));
      },

      removeSection: (id) => {
        set((s) => ({
          sections: s.sections.filter((sec) => sec.id !== id),
          dutyPlaces: s.dutyPlaces.filter((dp) => dp.sectionId !== id),
          assignments: s.assignments.filter((a) => a.sectionId !== id),
        }));
      },

      setSectionHead: (sectionId, prefectId) => {
        set((s) => ({
          sections: s.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, headId: prefectId } : sec
          ),
        }));
      },

      setSectionCoHead: (sectionId, prefectId) => {
        set((s) => ({
          sections: s.sections.map((sec) =>
            sec.id === sectionId ? { ...sec, coHeadId: prefectId } : sec
          ),
        }));
      },

      addDutyPlace: (dp) => {
        const newDp: DutyPlace = { ...dp, id: generateId() };
        set((s) => ({
          dutyPlaces: [...s.dutyPlaces, newDp],
          sections: s.sections.map((sec) =>
            sec.id === dp.sectionId ? { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, newDp.id] } : sec
          ),
        }));
      },

      removeDutyPlace: (id) => {
        set((s) => ({
          dutyPlaces: s.dutyPlaces.filter((dp) => dp.id !== id),
          assignments: s.assignments.filter((a) => a.dutyPlaceId !== id),
          sections: s.sections.map((sec) => ({
            ...sec,
            dutyPlaceIds: sec.dutyPlaceIds.filter((dpId) => dpId !== id),
          })),
        }));
      },

      updateDutyPlace: (id, updates) => {
        set((s) => ({
          dutyPlaces: s.dutyPlaces.map((dp) => (dp.id === id ? { ...dp, ...updates } : dp)),
        }));
      },

      assignPrefect: (prefectId, dutyPlaceId, sectionId) => {
        const state = get();
        const prefect = state.prefects.find((p) => p.id === prefectId);
        if (!prefect) return 'Prefect not found';
        if (prefect.isHeadPrefect || prefect.isDeputyHeadPrefect) return 'Head/Deputy Head excluded from duty';

        // Single-duty check
        const existing = state.assignments.find((a) => a.prefectId === prefectId);
        if (existing) return 'Prefect already has a duty assignment';

        // Check section head/co-head
        if (state.isSectionHeadOrCoHead(prefectId)) return 'Prefect is a Section Head/Co-Head (counts as duty)';

        const dp = state.dutyPlaces.find((d) => d.id === dutyPlaceId);
        if (!dp) return 'Duty place not found';

        // Max prefects check
        if (dp.maxPrefects) {
          const currentCount = state.assignments.filter((a) => a.dutyPlaceId === dutyPlaceId).length;
          if (currentCount >= dp.maxPrefects) return `Max ${dp.maxPrefects} prefects for this duty`;
        }

        const assignment: Assignment = { id: generateId(), prefectId, dutyPlaceId, sectionId };
        set((s) => ({ assignments: [...s.assignments, assignment] }));
        return null;
      },

      removeAssignment: (assignmentId) => {
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

      clearAllAssignments: () => {
        set({ assignments: [] });
      },

      autoAssign: () => {
        const state = get();
        let assigned = 0;
        let skipped = 0;

        const getAssignedIds = () => {
          const s = get();
          const assignedSet = new Set(s.assignments.map((a) => a.prefectId));
          // Section heads/co-heads count as assigned
          s.sections.forEach((sec) => {
            if (sec.headId) assignedSet.add(sec.headId);
            if (sec.coHeadId) assignedSet.add(sec.coHeadId);
          });
          return assignedSet;
        };

        const getAvailable = (filter?: { gender?: Gender; minGrade?: number }) => {
          const assignedIds = getAssignedIds();
          return get().prefects.filter((p) => {
            if (assignedIds.has(p.id)) return false;
            if (p.isHeadPrefect || p.isDeputyHeadPrefect) return false;
            if (filter?.gender && p.gender !== filter.gender) return false;
            if (filter?.minGrade && p.grade < filter.minGrade) return false;
            return true;
          });
        };

        // 1. Fill special duties first
        const specialPlaces = state.dutyPlaces.filter((dp) => dp.isSpecial);
        for (const dp of specialPlaces) {
          const maxSlots = dp.maxPrefects || 1;
          const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
          const slotsToFill = maxSlots - currentAssignments.length;

          if (slotsToFill <= 0) continue;

          if (dp.requiredGenderBalance && maxSlots >= 2) {
            // Try to assign one male, one female
            const currentGenders = currentAssignments.map((a) => {
              const p = state.prefects.find((pr) => pr.id === a.prefectId);
              return p?.gender;
            });
            const needMale = !currentGenders.includes('Male');
            const needFemale = !currentGenders.includes('Female');

            if (needMale) {
              const male = getAvailable({ gender: 'Male', minGrade: 8 })[0];
              if (male) {
                const err = get().assignPrefect(male.id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
            if (needFemale) {
              const female = getAvailable({ gender: 'Female', minGrade: 8 })[0];
              if (female) {
                const err = get().assignPrefect(female.id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
          } else {
            for (let i = 0; i < slotsToFill; i++) {
              const available = getAvailable({ minGrade: 8 });
              if (available.length > 0) {
                const err = get().assignPrefect(available[0].id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
          }
        }

        // 2. Fill classroom duties
        const classPlaces = state.dutyPlaces.filter((dp) => !dp.isSpecial);
        for (const dp of classPlaces) {
          const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
          if (currentAssignments.length > 0) continue;

          const classGrade = getClassGrade(dp.name);
          if (!classGrade) continue;

          // Prefect grade must be > class grade (except grade 11 can do 10/11)
          const available = getAvailable().filter((p) => {
            if (classGrade >= 11) return p.grade === 11;
            return p.grade > classGrade;
          });

          if (available.length > 0) {
            // Prefer lowest eligible grade (closest senior)
            available.sort((a, b) => a.grade - b.grade);
            const err = get().assignPrefect(available[0].id, dp.id, dp.sectionId);
            if (!err) assigned++; else skipped++;
          }
        }

        return { assigned, skipped };
      },

      validate: () => {
        const state = get();
        const issues: ValidationIssue[] = [];
        const assignedPrefectIds = new Set<string>();

        // Check assignments
        for (const assignment of state.assignments) {
          const prefect = state.prefects.find((p) => p.id === assignment.prefectId);
          const dp = state.dutyPlaces.find((d) => d.id === assignment.dutyPlaceId);
          if (!prefect || !dp) continue;

          // Single-duty violation
          if (assignedPrefectIds.has(prefect.id)) {
            issues.push({
              type: 'error',
              category: 'single_duty',
              message: `${prefect.name} has multiple duty assignments`,
              prefectId: prefect.id,
            });
          }
          assignedPrefectIds.add(prefect.id);

          // Grade mismatch
          const classGrade = getClassGrade(dp.name);
          if (classGrade) {
            if (classGrade >= 11) {
              if (prefect.grade !== 11) {
                issues.push({
                  type: 'error',
                  category: 'grade_mismatch',
                  message: `${prefect.name} (Grade ${prefect.grade}) assigned to ${dp.name} — only Grade 11 allowed`,
                  prefectId: prefect.id,
                  dutyPlaceId: dp.id,
                });
              }
            } else if (prefect.grade <= classGrade) {
              issues.push({
                type: 'error',
                category: 'grade_mismatch',
                message: `${prefect.name} (Grade ${prefect.grade}) cannot be assigned to ${dp.name} — must be senior`,
                prefectId: prefect.id,
                dutyPlaceId: dp.id,
              });
            }

            // Same-age check (same grade except grade 11)
            if (prefect.grade === classGrade && prefect.grade !== 11) {
              issues.push({
                type: 'error',
                category: 'same_age',
                message: `${prefect.name} (Grade ${prefect.grade}) same grade as ${dp.name}`,
                prefectId: prefect.id,
                dutyPlaceId: dp.id,
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
            const hasMale = genders.includes('Male');
            const hasFemale = genders.includes('Female');
            if (!hasMale || !hasFemale) {
              issues.push({
                type: 'warning',
                category: 'gender_violation',
                message: `${dp.name} requires gender balance`,
                dutyPlaceId: dp.id,
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
              type: 'warning',
              category: 'vacant_mandatory',
              message: `${dp.name} (mandatory) has no prefect assigned`,
              dutyPlaceId: dp.id,
            });
          }
        }

        // Section head/co-head single-duty check
        for (const section of state.sections) {
          if (section.headId && assignedPrefectIds.has(section.headId)) {
            const p = state.prefects.find((pr) => pr.id === section.headId);
            issues.push({
              type: 'error',
              category: 'single_duty',
              message: `${p?.name} is Section Head of ${section.name} AND has a duty assignment`,
              prefectId: section.headId,
            });
          }
          if (section.coHeadId && assignedPrefectIds.has(section.coHeadId)) {
            const p = state.prefects.find((pr) => pr.id === section.coHeadId);
            issues.push({
              type: 'error',
              category: 'single_duty',
              message: `${p?.name} is Co-Head of ${section.name} AND has a duty assignment`,
              prefectId: section.coHeadId,
            });
          }
        }

        return issues;
      },

      getPrefectDuty: (prefectId) => get().assignments.find((a) => a.prefectId === prefectId),

      getAssignedPrefect: (dutyPlaceId) => get().assignments.filter((a) => a.dutyPlaceId === dutyPlaceId),

      getAvailablePrefects: () => {
        const state = get();
        const assignedIds = new Set(state.assignments.map((a) => a.prefectId));
        state.sections.forEach((sec) => {
          if (sec.headId) assignedIds.add(sec.headId);
          if (sec.coHeadId) assignedIds.add(sec.coHeadId);
        });
        return state.prefects.filter(
          (p) => !assignedIds.has(p.id) && !p.isHeadPrefect && !p.isDeputyHeadPrefect
        );
      },

      isSectionHeadOrCoHead: (prefectId) => {
        return get().sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId);
      },
    }),
    { name: 'prefect-duty-store' }
  )
);
