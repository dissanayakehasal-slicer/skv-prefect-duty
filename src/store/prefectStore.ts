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
        if (prefect.isHeadPrefect) return 'Head Prefect excluded from normal duty';

        // Check if already assigned to this exact duty place
        const duplicate = state.assignments.find((a) => a.prefectId === prefectId && a.dutyPlaceId === dutyPlaceId);
        if (duplicate) return 'Prefect already assigned to this duty place';

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

        // Helper: get section grade number from section name
        const getSectionGrade = (sectionName: string): number | null => {
          const match = sectionName.match(/GRADE\s+(\d+)/i);
          return match ? parseInt(match[1]) : null;
        };

        // Helper: check if prefect is eligible to lead a section
        const isEligibleHead = (prefect: Prefect, sectionGrade: number): boolean => {
          if (sectionGrade <= 7) return prefect.grade >= sectionGrade + 2;
          if (sectionGrade === 8) return prefect.grade >= 10;
          return prefect.grade === 11; // grades 9, 10, 11
        };

        // Helper: count duties for a prefect (assignments + head/co-head roles)
        const getDutyCount = (prefectId: string): number => {
          const s = get();
          let count = s.assignments.filter((a) => a.prefectId === prefectId).length;
          s.sections.forEach((sec) => {
            if (sec.headId === prefectId) count++;
            if (sec.coHeadId === prefectId) count++;
          });
          return count;
        };

        // Helper: pick best prefect from candidates (fewest duties first)
        const pickBest = (candidates: Prefect[]): Prefect | undefined => {
          if (candidates.length === 0) return undefined;
          candidates.sort((a, b) => getDutyCount(a.id) - getDutyCount(b.id));
          return candidates[0];
        };

        // Helper: get eligible prefects (excludes head prefects from normal duties)
        const getEligible = (filter?: { gender?: Gender; minGrade?: number; excludeHeadPrefect?: boolean }) => {
          return get().prefects.filter((p) => {
            if (filter?.excludeHeadPrefect !== false && p.isHeadPrefect) return false;
            if (filter?.gender && p.gender !== filter.gender) return false;
            if (filter?.minGrade && p.grade < filter.minGrade) return false;
            return true;
          });
        };

        // ===== PHASE 1: Auto-assign Section Heads (male priority) =====
        for (const section of get().sections) {
          if (section.headId) continue; // already has head
          const sectionGrade = getSectionGrade(section.name);
          if (!sectionGrade) continue; // non-grade sections (A, B) skip

          const candidates = getEligible({ gender: 'Male' }).filter((p) => isEligibleHead(p, sectionGrade));
          const best = pickBest(candidates);
          if (best) {
            get().setSectionHead(section.id, best.id);
            assigned++;
          } else {
            // Fallback: try any gender
            const fallback = pickBest(getEligible().filter((p) => isEligibleHead(p, sectionGrade)));
            if (fallback) {
              get().setSectionHead(section.id, fallback.id);
              assigned++;
            } else {
              skipped++;
            }
          }
        }

        // ===== PHASE 2: Auto-assign Co-Section Heads (female priority) =====
        for (const section of get().sections) {
          if (section.coHeadId) continue;
          const sectionGrade = getSectionGrade(section.name);
          if (!sectionGrade) continue;

          const candidates = getEligible({ gender: 'Female' }).filter((p) => {
            if (p.isHeadPrefect) return false;
            return isEligibleHead(p, sectionGrade);
          });
          const best = pickBest(candidates);
          if (best) {
            get().setSectionCoHead(section.id, best.id);
            assigned++;
          } else {
            const fallback = pickBest(getEligible().filter((p) => isEligibleHead(p, sectionGrade) && !p.isHeadPrefect));
            if (fallback) {
              get().setSectionCoHead(section.id, fallback.id);
              assigned++;
            } else {
              skipped++;
            }
          }
        }

        // ===== PHASE 3: Fill special duties =====
        const specialPlaces = get().dutyPlaces.filter((dp) => dp.isSpecial);
        for (const dp of specialPlaces) {
          const maxSlots = dp.maxPrefects || 1;
          const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
          const slotsToFill = maxSlots - currentAssignments.length;
          if (slotsToFill <= 0) continue;

          if (dp.requiredGenderBalance && maxSlots >= 2) {
            const currentGenders = currentAssignments.map((a) => {
              const p = get().prefects.find((pr) => pr.id === a.prefectId);
              return p?.gender;
            });
            if (!currentGenders.includes('Male')) {
              const best = pickBest(getEligible({ gender: 'Male', minGrade: 8 }));
              if (best) {
                const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
            if (!currentGenders.includes('Female')) {
              const best = pickBest(getEligible({ gender: 'Female', minGrade: 8 }));
              if (best) {
                const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
          } else {
            for (let i = 0; i < slotsToFill; i++) {
              const best = pickBest(getEligible({ minGrade: 8 }));
              if (best) {
                const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
                if (!err) assigned++; else skipped++;
              }
            }
          }
        }

        // ===== PHASE 4: Fill classroom duties (round-robin, balanced) =====
        const classPlaces = get().dutyPlaces.filter((dp) => !dp.isSpecial);
        for (const dp of classPlaces) {
          const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
          const maxSlots = dp.maxPrefects || 1;
          if (currentAssignments.length >= maxSlots) continue;

          const classGrade = getClassGrade(dp.name);
          if (!classGrade) continue;

          const eligible = getEligible().filter((p) => {
            // Check not already assigned to this exact duty place
            if (get().assignments.some((a) => a.prefectId === p.id && a.dutyPlaceId === dp.id)) return false;
            if (classGrade >= 11) return p.grade === 11;
            return p.grade > classGrade;
          });

          const best = pickBest(eligible);
          if (best) {
            const err = get().assignPrefect(best.id, dp.id, dp.sectionId);
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
