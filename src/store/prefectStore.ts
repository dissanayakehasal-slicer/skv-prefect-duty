import { create } from 'zustand';
import { cloudSyncMode, getApiJwt } from '@/lib/backendEnv';
import { backendRpc } from '@/lib/backendRpc';
import {
  Prefect, Section, DutyPlace, Assignment, ValidationIssue,
  generateId, calculateLevel, Gender, PointLog,
  MAX_GAMES_CAPTAINS,
} from '@/types/prefect';

const BASE_STANDING_POINTS = 1000;
const STANDINGS_SETTINGS_KEY = 'standings_state';

function useCloudApi(): boolean {
  return cloudSyncMode() === 'vercel';
}
const LOCAL_FALLBACK_KEY = 'prefect_store_local_fallback_v1';

function applyLocalFallback() {
  const local = loadLocalFallbackState();
  return {
    prefects: local.prefects,
    sections: local.sections,
    dutyPlaces: local.dutyPlaces,
    assignments: local.assignments,
    standingsPoints: local.standingsPoints,
    pointLogs: local.pointLogs,
    loading: false as const,
    initialized: true as const,
  };
}

interface StandingsState {
  pointsByPrefect: Record<string, number>;
  logs: PointLog[];
}

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
  standingsPoints: Record<string, number>;
  pointLogs: PointLog[];
  loading: boolean;
  initialized: boolean;

  loadFromDB: () => Promise<void>;
  addPrefect: (p: Omit<Prefect, 'id' | 'level'>) => Promise<string | null>;
  updatePrefect: (id: string, p: Partial<Prefect>) => Promise<string | null>;
  removePrefect: (id: string) => Promise<string | null>;
  importPrefects: (prefects: Omit<Prefect, 'id' | 'level'>[]) => Promise<string | null>;
  addSection: (name: string) => Promise<string | null>;
  removeSection: (id: string) => Promise<string | null>;
  renameSection: (id: string, name: string) => Promise<void>;
  setSectionHead: (sectionId: string, prefectId: string | undefined) => Promise<string | null>;
  setSectionCoHead: (sectionId: string, prefectId: string | undefined) => Promise<string | null>;
  addDutyPlace: (dp: Omit<DutyPlace, 'id'>) => Promise<void>;
  removeDutyPlace: (id: string) => Promise<void>;
  updateDutyPlace: (id: string, dp: Partial<DutyPlace>) => Promise<void>;
  importDutyPlaces: (dps: Omit<DutyPlace, 'id'>[]) => Promise<string | null>;
  assignPrefect: (prefectId: string, dutyPlaceId: string, sectionId: string) => Promise<string | null>;
  removeAssignment: (assignmentId: string) => Promise<void>;
  swapAssignments: (a1Id: string, a2Id: string) => void;
  clearAllAssignments: () => Promise<void>;
  autoAssign: () => Promise<AutoAssignReport>;
  autoFillRemaining: () => Promise<AutoAssignReport>;
  validate: () => ValidationIssue[];
  autoFixConflicts: () => Promise<{ clearedAssignments: number; clearedLeadership: number; fixedSameLeader: number }>;
  getPrefectDuty: (prefectId: string) => Assignment | undefined;
  getAssignedPrefect: (dutyPlaceId: string) => Assignment[];
  getAvailablePrefects: () => Prefect[];
  isSectionHeadOrCoHead: (prefectId: string) => boolean;
  getDutyCount: (prefectId: string) => number;
  getPrefectPoints: (prefectId: string) => number;
  applyPointChange: (prefectIds: string[], amount: number, reason: string) => Promise<string | null>;
}

interface LocalFallbackState {
  prefects: Prefect[];
  sections: Section[];
  dutyPlaces: DutyPlace[];
  assignments: Assignment[];
  standingsPoints: Record<string, number>;
  pointLogs: PointLog[];
}

function buildDefaultLocalState(): LocalFallbackState {
  return {
    prefects: [],
    sections: [],
    dutyPlaces: [],
    assignments: [],
    standingsPoints: {},
    pointLogs: [],
  };
}

function loadLocalFallbackState(): LocalFallbackState {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (!raw) return buildDefaultLocalState();
    const parsed = JSON.parse(raw) as Partial<LocalFallbackState>;
    const defaults = buildDefaultLocalState();
    return {
      prefects: Array.isArray(parsed.prefects) ? parsed.prefects : defaults.prefects,
      sections: Array.isArray(parsed.sections) ? parsed.sections : defaults.sections,
      dutyPlaces: Array.isArray(parsed.dutyPlaces) ? parsed.dutyPlaces : defaults.dutyPlaces,
      assignments: Array.isArray(parsed.assignments) ? parsed.assignments : defaults.assignments,
      standingsPoints: parsed.standingsPoints && typeof parsed.standingsPoints === 'object' ? parsed.standingsPoints : defaults.standingsPoints,
      pointLogs: Array.isArray(parsed.pointLogs) ? parsed.pointLogs : defaults.pointLogs,
    };
  } catch (error) {
    console.error('Failed to load local fallback state:', error);
    return buildDefaultLocalState();
  }
}

function persistLocalFallbackState(state: LocalFallbackState) {
  try {
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to persist local fallback state:', error);
  }
}

function normalizeStandingsState(prefects: Prefect[], rawValue?: string | null): StandingsState {
  let parsed: Partial<StandingsState> = {};

  if (rawValue) {
    try {
      parsed = JSON.parse(rawValue) as Partial<StandingsState>;
    } catch (error) {
      console.error('Failed to parse standings state:', error);
    }
  }

  const savedPointValues = prefects
    .map((prefect) => parsed.pointsByPrefect?.[prefect.id])
    .filter((value): value is number => typeof value === 'number');
  const useLegacyBaseMigration = savedPointValues.length > 0 && savedPointValues.every((value) => value === 100);

  const pointsByPrefect: Record<string, number> = {};
  prefects.forEach((prefect) => {
    const savedPoints = parsed.pointsByPrefect?.[prefect.id];
    if (useLegacyBaseMigration) {
      pointsByPrefect[prefect.id] = BASE_STANDING_POINTS;
      return;
    }

    pointsByPrefect[prefect.id] = typeof savedPoints === 'number' ? savedPoints : BASE_STANDING_POINTS;
  });

  const logs = Array.isArray(parsed.logs)
    ? parsed.logs
        .filter((log): log is PointLog => (
          !!log &&
          typeof log.prefectId === 'string' &&
          typeof log.reason === 'string' &&
          typeof log.amount === 'number' &&
          typeof log.createdAt === 'string'
        ))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  return { pointsByPrefect, logs };
}

async function persistStandingsState(pointsByPrefect: Record<string, number>, logs: PointLog[]) {
  const value = JSON.stringify({ pointsByPrefect, logs });
  if (!useCloudApi()) return;
  try {
    await backendRpc('settings_upsert_standings', { value });
  } catch (error) {
    console.error('Failed to persist standings state:', error);
  }
}

function getClassGrade(dutyPlaceName: string): number | null {
  // Support classes like "8A" through "8Z" (case-insensitive)
  const match = dutyPlaceName.match(/^(\d+)[A-Z]$/i);
  return match ? parseInt(match[1]) : null;
}

function getSectionGrade(sectionName: string): number | null {
  const match = sectionName.match(/GRADE\s+(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

function isEligibleHead(prefectGrade: number, sectionGrade: number): boolean {
  // Rule: section heads/co-heads must be at least one grade older than the section.
  return prefectGrade >= sectionGrade + 1;
}

export const usePrefectStore = create<PrefectStore>()((set, get) => ({
  prefects: [],
  sections: [],
  dutyPlaces: [],
  assignments: [],
  standingsPoints: {},
  pointLogs: [],
  loading: false,
  initialized: false,

  loadFromDB: async () => {
    set({ loading: true });
    try {
      const mode = cloudSyncMode();
      if (!mode) {
        console.warn('No cloud backend configured — loading local backup data');
        set(applyLocalFallback());
        return;
      }

      let prefectsData: unknown[] = [];
      let sectionsData: unknown[] = [];
      let dutyPlacesData: unknown[] = [];
      let assignmentsData: unknown[] = [];
      let standingsValue: string | undefined;

      try {
        const pack = await backendRpc<{
          prefects: unknown[];
          sections: unknown[];
          duty_places: unknown[];
          assignments: unknown[];
          standings_value: string | null;
        }>('workspace_load', {}, getApiJwt());
        prefectsData = pack.prefects || [];
        sectionsData = pack.sections || [];
        dutyPlacesData = pack.duty_places || [];
        assignmentsData = pack.assignments || [];
        standingsValue = pack.standings_value ?? undefined;
      } catch (e) {
        console.error('Workspace load failed, using local backup:', e);
        set(applyLocalFallback());
        return;
      }

      const prefects: Prefect[] = (prefectsData as {
        id: string; name: string; reg_number: string; grade: number; gender: string;
        role: string;
      }[]).map((p) => ({
        id: p.id,
        name: p.name,
        regNo: p.reg_number,
        grade: p.grade,
        gender: (p.gender === 'M' ? 'Male' : 'Female') as Gender,
        level: calculateLevel(p.grade),
        isHeadPrefect: p.role === 'head_prefect',
        isDeputyHeadPrefect: p.role === 'deputy_head_prefect',
        isGamesCaptain: p.role === 'games_captain',
      }));

      const sections: Section[] = (sectionsData as {
        id: string; name: string; head_prefect_id: string | null; co_head_prefect_id: string | null;
      }[]).map((s) => ({
        id: s.id,
        name: s.name,
        headId: s.head_prefect_id || undefined,
        coHeadId: s.co_head_prefect_id || undefined,
        dutyPlaceIds: (dutyPlacesData as { id: string; section_id: string | null }[])
          .filter((dp) => dp.section_id === s.id)
          .map((dp) => dp.id),
      }));

      const dutyPlaces: DutyPlace[] = (dutyPlacesData as {
        id: string; name: string; section_id: string | null; type: string;
        mandatory_slots: number; max_prefects: number; required_gender_balance: boolean;
        gender_requirement: string | null; grade_requirement: string | null;
        same_grade_if_multiple: boolean;
      }[]).map((dp) => ({
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

      const assignments: Assignment[] = (assignmentsData as {
        id: string; prefect_id: string; duty_place_id: string;
      }[]).map((a) => ({
        id: a.id,
        prefectId: a.prefect_id,
        dutyPlaceId: a.duty_place_id,
        sectionId: dutyPlaces.find((dp) => dp.id === a.duty_place_id)?.sectionId || '',
      }));

      const standings = normalizeStandingsState(prefects, standingsValue);

      set({
        prefects,
        sections,
        dutyPlaces,
        assignments,
        standingsPoints: standings.pointsByPrefect,
        pointLogs: standings.logs,
        loading: false,
        initialized: true,
      });

      await persistStandingsState(standings.pointsByPrefect, standings.logs);
    } catch (err) {
      console.error('Failed to load from DB:', err);
      set(applyLocalFallback());
    }
  },

  addPrefect: async (p) => {
    if (p.isGamesCaptain) {
      const gc = get().prefects.filter((x) => x.isGamesCaptain).length;
      if (gc >= MAX_GAMES_CAPTAINS) return `Maximum ${MAX_GAMES_CAPTAINS} Games Captains allowed`;
    }
    const row = {
      name: p.name,
      reg_number: p.regNo,
      grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: p.isHeadPrefect
        ? 'head_prefect'
        : p.isDeputyHeadPrefect
          ? 'deputy_head_prefect'
          : p.isGamesCaptain
            ? 'games_captain'
            : 'prefect',
    };
    let data: {
      id: string;
      name: string;
      reg_number: string;
      grade: number;
      role: string;
    } | null = null;
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        data = (await backendRpc('prefect_insert', { row }, getApiJwt())) as typeof data;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Insert failed' };
      }
    } else {
      data = null;
      error = { message: 'Cloud API disabled' };
    }
    if (error || !data) {
      console.error(error);
      const fallback: Prefect = {
        id: generateId(),
        name: p.name,
        regNo: p.regNo,
        grade: p.grade,
        gender: p.gender,
        level: calculateLevel(p.grade),
        isHeadPrefect: !!p.isHeadPrefect,
        isDeputyHeadPrefect: !!p.isDeputyHeadPrefect,
        isGamesCaptain: !!p.isGamesCaptain,
      };
      const nextPoints = { ...get().standingsPoints, [fallback.id]: BASE_STANDING_POINTS };
      set((s) => ({ prefects: [...s.prefects, fallback], standingsPoints: nextPoints }));
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
      return null;
    }
    const prefect: Prefect = {
      id: data.id, name: data.name, regNo: data.reg_number, grade: data.grade,
      gender: p.gender, level: calculateLevel(data.grade),
      isHeadPrefect: data.role === 'head_prefect', isDeputyHeadPrefect: data.role === 'deputy_head_prefect',
      isGamesCaptain: data.role === 'games_captain',
    };
    const nextPoints = { ...get().standingsPoints, [prefect.id]: BASE_STANDING_POINTS };
    set((s) => ({ prefects: [...s.prefects, prefect], standingsPoints: nextPoints }));
    await persistStandingsState(nextPoints, get().pointLogs);
    const s = get();
    persistLocalFallbackState({
      prefects: s.prefects,
      sections: s.sections,
      dutyPlaces: s.dutyPlaces,
      assignments: s.assignments,
      standingsPoints: s.standingsPoints,
      pointLogs: s.pointLogs,
    });
    return null;
  },

  updatePrefect: async (id, updates) => {
    if (updates.isHeadPrefect !== undefined || updates.isDeputyHeadPrefect !== undefined || updates.isGamesCaptain !== undefined) {
      const current = get().prefects.find((pref) => pref.id === id);
      const willBeGC = updates.isGamesCaptain ?? current?.isGamesCaptain;
      if (willBeGC && !current?.isGamesCaptain) {
        const otherGc = get().prefects.filter((pref) => pref.id !== id && pref.isGamesCaptain).length;
        if (otherGc >= MAX_GAMES_CAPTAINS) return `Maximum ${MAX_GAMES_CAPTAINS} Games Captains allowed`;
      }
    }
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.regNo !== undefined) dbUpdates.reg_number = updates.regNo;
    if (updates.grade !== undefined) dbUpdates.grade = updates.grade;
    if (updates.gender !== undefined) dbUpdates.gender = updates.gender === 'Male' ? 'M' : 'F';
    if (updates.isHeadPrefect !== undefined || updates.isDeputyHeadPrefect !== undefined || updates.isGamesCaptain !== undefined) {
      const current = get().prefects.find((p) => p.id === id);
      const isHP = updates.isHeadPrefect ?? current?.isHeadPrefect;
      const isDHP = updates.isDeputyHeadPrefect ?? current?.isDeputyHeadPrefect;
      const isGC = updates.isGamesCaptain ?? current?.isGamesCaptain;
      dbUpdates.role = isHP ? 'head_prefect' : isDHP ? 'deputy_head_prefect' : isGC ? 'games_captain' : 'prefect';
    }
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        await backendRpc('prefect_update', { id, updates: dbUpdates }, getApiJwt());
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Update failed' };
      }
    } else {
      error = { message: 'Cloud API disabled' };
    }
    if (error) {
      console.error(error);
      set((s) => ({
        prefects: s.prefects.map((p) =>
          p.id === id ? { ...p, ...updates, level: updates.grade ? calculateLevel(updates.grade) : p.level } : p
        ),
      }));
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
      return null;
    }
    set((s) => ({
      prefects: s.prefects.map((p) =>
        p.id === id ? { ...p, ...updates, level: updates.grade ? calculateLevel(updates.grade) : p.level } : p
      ),
    }));
    {
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
    }
    return null;
  },

  removePrefect: async (id) => {
    const state = get();
    if (state.assignments.some((a) => a.prefectId === id)) return 'Cannot delete: prefect has active assignments. Remove those first.';
    if (state.sections.some((s) => s.headId === id || s.coHeadId === id)) return 'Cannot delete: prefect has leadership roles. Remove those first.';
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        await backendRpc('prefect_deactivate', { id }, getApiJwt());
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Remove failed' };
      }
    } else {
      error = { message: 'Cloud API disabled' };
    }
    if (error) return 'Failed to remove: ' + error.message;
    const nextPoints = { ...state.standingsPoints };
    delete nextPoints[id];
    set((s) => ({ prefects: s.prefects.filter((p) => p.id !== id), standingsPoints: nextPoints }));
    await persistStandingsState(nextPoints, state.pointLogs);
    return null;
  },

  importPrefects: async (prefects) => {
    const existingGc = get().prefects.filter((p) => p.isGamesCaptain).length;
    const incomingGc = prefects.filter((p) => p.isGamesCaptain).length;
    if (existingGc + incomingGc > MAX_GAMES_CAPTAINS) {
      return `At most ${MAX_GAMES_CAPTAINS} Games Captains allowed (${existingGc} already, ${incomingGc} in import)`;
    }
    const rows = prefects.map((p) => ({
      name: p.name, reg_number: p.regNo, grade: p.grade,
      gender: p.gender === 'Male' ? 'M' : 'F',
      role: (
        p.isHeadPrefect
          ? 'head_prefect'
          : p.isDeputyHeadPrefect
            ? 'deputy_head_prefect'
            : p.isGamesCaptain
              ? 'games_captain'
              : 'prefect'
      ) as 'prefect' | 'head_prefect' | 'deputy_head_prefect' | 'games_captain',
    }));
    let data: { id: string; name: string; reg_number: string; grade: number; gender: string; role: string }[] | null = null;
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        const out = await backendRpc<{ rows: typeof data }>('prefect_batch_insert', { rows }, getApiJwt());
        data = out.rows as typeof data;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Import failed' };
      }
    } else {
      data = null;
      error = { message: 'Cloud API disabled' };
    }
    if (error || !data) {
      console.error(error);
      const newPrefects: Prefect[] = prefects.map((p) => ({
        id: generateId(),
        name: p.name,
        regNo: p.regNo,
        grade: p.grade,
        gender: p.gender,
        level: calculateLevel(p.grade),
        isHeadPrefect: !!p.isHeadPrefect,
        isDeputyHeadPrefect: !!p.isDeputyHeadPrefect,
        isGamesCaptain: !!p.isGamesCaptain,
      }));
      const nextPoints = { ...get().standingsPoints };
      newPrefects.forEach((prefect) => {
        nextPoints[prefect.id] = BASE_STANDING_POINTS;
      });
      set((s) => ({ prefects: [...s.prefects, ...newPrefects], standingsPoints: nextPoints }));
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
      return null;
    }
    const newPrefects: Prefect[] = data.map((d) => ({
      id: d.id, name: d.name, regNo: d.reg_number, grade: d.grade,
      gender: (d.gender === 'M' ? 'Male' : 'Female') as Gender,
      level: calculateLevel(d.grade),
      isHeadPrefect: d.role === 'head_prefect', isDeputyHeadPrefect: d.role === 'deputy_head_prefect',
      isGamesCaptain: d.role === 'games_captain',
    }));
    const nextPoints = { ...get().standingsPoints };
    newPrefects.forEach((prefect) => {
      nextPoints[prefect.id] = BASE_STANDING_POINTS;
    });
    set((s) => ({ prefects: [...s.prefects, ...newPrefects], standingsPoints: nextPoints }));
    await persistStandingsState(nextPoints, get().pointLogs);
    {
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
    }
    return null;
  },

  addSection: async (name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return 'Section name is required';
    let data: {
      id: string;
      name: string;
      head_prefect_id: string | null;
      co_head_prefect_id: string | null;
    } | null = null;
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        data = (await backendRpc('section_insert', { name: trimmedName }, getApiJwt())) as typeof data;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Insert failed' };
      }
    } else {
      data = null;
      error = { message: 'Cloud API disabled' };
    }
    if (error || !data) {
      const localSection: Section = { id: generateId(), name: trimmedName, headId: undefined, coHeadId: undefined, dutyPlaceIds: [] };
      set((s) => ({ sections: [...s.sections, localSection] }));
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
      return null;
    }
    set((s) => ({ sections: [...s.sections, { id: data.id, name: data.name, headId: data.head_prefect_id || undefined, coHeadId: data.co_head_prefect_id || undefined, dutyPlaceIds: [] }] }));
    {
      const s = get();
      persistLocalFallbackState({
        prefects: s.prefects,
        sections: s.sections,
        dutyPlaces: s.dutyPlaces,
        assignments: s.assignments,
        standingsPoints: s.standingsPoints,
        pointLogs: s.pointLogs,
      });
    }
    return null;
  },

  removeSection: async (id) => {
    const state = get();
    const sectionDpIds = state.dutyPlaces.filter((dp) => dp.sectionId === id).map((dp) => dp.id);
    if (useCloudApi()) {
      try {
        await backendRpc('section_delete', { id }, getApiJwt());
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not delete section';
      }
    }
    set((s) => ({
      sections: s.sections.filter((sec) => sec.id !== id),
      dutyPlaces: s.dutyPlaces.filter((dp) => dp.sectionId !== id),
      assignments: s.assignments.filter((a) => !sectionDpIds.includes(a.dutyPlaceId)),
    }));
    return null;
  },

  renameSection: async (id, name) => {
    if (useCloudApi()) {
      await backendRpc('section_rename', { id, name }, getApiJwt());
    }
    set((s) => ({ sections: s.sections.map((sec) => sec.id === id ? { ...sec, name } : sec) }));
  },

  setSectionHead: async (sectionId, prefectId) => {
    const state = get();
    const section = state.sections.find((s) => s.id === sectionId);
    if (!section) return 'Section not found';

    // Clearing head is always allowed
    if (!prefectId) {
      if (useCloudApi()) {
        await backendRpc('section_set_head', { sectionId, prefectId: null }, getApiJwt());
      }
      set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, headId: undefined } : sec) }));
      return null;
    }

    const prefect = state.prefects.find((p) => p.id === prefectId);
    if (!prefect) return 'Prefect not found';
    if (section.coHeadId === prefectId) return 'A prefect cannot be both Head and Co-Head of the same section';
    if (prefect.isHeadPrefect) return 'Head Prefect cannot be a Section Head';
    if (prefect.isDeputyHeadPrefect) return 'Deputy Head Prefect cannot be a Section Head';
    if (prefect.isGamesCaptain) return 'Games Captain cannot be a Section Head';
    if (state.assignments.some((a) => a.prefectId === prefectId)) return 'Prefect already has a duty assignment';
    if (state.sections.some((s) => s.id !== sectionId && (s.headId === prefectId || s.coHeadId === prefectId))) return 'Prefect already leads another section';

    const sectionGrade = getSectionGrade(section.name);
    if (sectionGrade !== null && !isEligibleHead(prefect.grade, sectionGrade)) {
      return `Section Head must be at least one grade above ${section.name}`;
    }

    if (useCloudApi()) {
      await backendRpc('section_set_head', { sectionId, prefectId }, getApiJwt());
    }
    set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, headId: prefectId } : sec) }));
    return null;
  },

  setSectionCoHead: async (sectionId, prefectId) => {
    const state = get();
    const section = state.sections.find((s) => s.id === sectionId);
    if (!section) return 'Section not found';

    // Clearing co-head is always allowed
    if (!prefectId) {
      if (useCloudApi()) {
        await backendRpc('section_set_co_head', { sectionId, prefectId: null }, getApiJwt());
      }
      set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, coHeadId: undefined } : sec) }));
      return null;
    }

    const prefect = state.prefects.find((p) => p.id === prefectId);
    if (!prefect) return 'Prefect not found';
    if (section.headId === prefectId) return 'A prefect cannot be both Head and Co-Head of the same section';
    if (prefect.isHeadPrefect) return 'Head Prefect cannot be a Co-Section Head';
    if (prefect.isDeputyHeadPrefect) return 'Deputy Head Prefect cannot be a Co-Section Head';
    if (prefect.isGamesCaptain) return 'Games Captain cannot be a Co-Section Head';
    if (state.assignments.some((a) => a.prefectId === prefectId)) return 'Prefect already has a duty assignment';
    if (state.sections.some((s) => s.id !== sectionId && (s.headId === prefectId || s.coHeadId === prefectId))) return 'Prefect already leads another section';

    const sectionGrade = getSectionGrade(section.name);
    if (sectionGrade !== null && !isEligibleHead(prefect.grade, sectionGrade)) {
      return `Co-Section Head must be at least one grade above ${section.name}`;
    }

    if (useCloudApi()) {
      await backendRpc('section_set_co_head', { sectionId, prefectId }, getApiJwt());
    }
    set((s) => ({ sections: s.sections.map((sec) => sec.id === sectionId ? { ...sec, coHeadId: prefectId } : sec) }));
    return null;
  },

  addDutyPlace: async (dp) => {
    const insertBody = {
      name: dp.name,
      section_id: dp.sectionId || null,
      type: dp.isSpecial ? 'special' : 'classroom',
      mandatory_slots: dp.minPrefects ?? (dp.isMandatory ? 1 : 0),
      max_prefects: dp.maxPrefects ?? 1,
      required_gender_balance: dp.requiredGenderBalance || false,
      gender_requirement: dp.genderRequirement || null,
      grade_requirement: dp.gradeRequirement || null,
      same_grade_if_multiple: dp.sameGradeIfMultiple || false,
    };
    let data: { id: string } | null = null;
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        data = (await backendRpc('duty_insert', insertBody, getApiJwt())) as { id: string };
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Insert failed' };
      }
    } else {
      data = null;
      error = { message: 'Cloud API disabled' };
    }
    const newDp: DutyPlace = { ...dp, id: data?.id || generateId() };
    set((s) => ({
      dutyPlaces: [...s.dutyPlaces, newDp],
      sections: s.sections.map((sec) => sec.id === dp.sectionId ? { ...sec, dutyPlaceIds: [...sec.dutyPlaceIds, newDp.id] } : sec),
    }));
    if (error || !data) console.error(error);
    const s = get();
    persistLocalFallbackState({
      prefects: s.prefects,
      sections: s.sections,
      dutyPlaces: s.dutyPlaces,
      assignments: s.assignments,
      standingsPoints: s.standingsPoints,
      pointLogs: s.pointLogs,
    });
  },

  removeDutyPlace: async (id) => {
    if (useCloudApi()) {
      await backendRpc('duty_delete', { id }, getApiJwt());
    }
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
    if (Object.keys(dbUpdates).length > 0) {
      if (useCloudApi()) {
        await backendRpc('duty_update', { id, updates: dbUpdates }, getApiJwt());
      }
    }
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
      max_prefects: dp.maxPrefects ?? 1,
      required_gender_balance: dp.requiredGenderBalance || false,
      gender_requirement: dp.genderRequirement || null,
      grade_requirement: dp.gradeRequirement || null,
      same_grade_if_multiple: dp.sameGradeIfMultiple || false,
    }));
    let data: {
      id: string; name: string; section_id: string | null; type: string;
      mandatory_slots: number; max_prefects: number; required_gender_balance: boolean;
      gender_requirement: string | null; grade_requirement: string | null; same_grade_if_multiple: boolean;
    }[] | null = null;
    let error: { message: string } | null = null;
    if (useCloudApi()) {
      try {
        const out = await backendRpc<{ rows: typeof data }>('duty_batch_insert', { rows }, getApiJwt());
        data = out.rows as typeof data;
      } catch (e) {
        error = { message: e instanceof Error ? e.message : 'Import failed' };
      }
    } else {
      data = null;
      error = { message: 'Cloud API disabled' };
    }
    const newDps: DutyPlace[] = (error || !data)
      ? dps.map((dp) => ({ ...dp, id: generateId() }))
      : data.map((d) => ({
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
    if (error || !data) console.error(error);
    const s = get();
    persistLocalFallbackState({
      prefects: s.prefects,
      sections: s.sections,
      dutyPlaces: s.dutyPlaces,
      assignments: s.assignments,
      standingsPoints: s.standingsPoints,
      pointLogs: s.pointLogs,
    });
    return null;
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

  assignPrefect: async (prefectId, dutyPlaceId, sectionId) => {
    const state = get();
    const prefect = state.prefects.find((p) => p.id === prefectId);
    if (!prefect) return 'Prefect not found';
    if (prefect.isHeadPrefect) return 'Head Prefect is excluded from duty assignments';
    if (prefect.isDeputyHeadPrefect) return 'Deputy Head Prefect is excluded from duty assignments';
    if (prefect.isGamesCaptain) return 'Games Captain is excluded from duty assignments';
    if (state.assignments.find((a) => a.prefectId === prefectId)) return 'Prefect is already assigned to a duty. Remove existing assignment first.';
    if (state.sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId)) return 'Prefect is a section head/co-head. Remove leadership role first.';
    const dp = state.dutyPlaces.find((d) => d.id === dutyPlaceId);
    if (!dp) return 'Duty place not found';
    const currentCount = state.assignments.filter((a) => a.dutyPlaceId === dutyPlaceId).length;
    const max = dp.maxPrefects === 0 ? Infinity : (dp.maxPrefects || 1);
    if (currentCount >= max) return dp.maxPrefects === 0 ? 'This duty has no max limit' : `Max ${dp.maxPrefects || 1} prefects for this duty`;

    const assignment: Assignment = { id: generateId(), prefectId, dutyPlaceId, sectionId };
    set((s) => ({ assignments: [...s.assignments, assignment] }));
    if (useCloudApi()) {
      try {
        await backendRpc(
          'assignment_insert',
          { id: assignment.id, prefect_id: prefectId, duty_place_id: dutyPlaceId, assigned_by: 'manual' },
          getApiJwt(),
        );
      } catch (e) {
        set((s) => ({ assignments: s.assignments.filter((a) => a.id !== assignment.id) }));
        return e instanceof Error ? e.message : 'Could not save assignment';
      }
    }
    return null;
  },

  removeAssignment: async (assignmentId) => {
    if (useCloudApi()) {
      await backendRpc('assignment_delete', { id: assignmentId }, getApiJwt());
    }
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
    if (useCloudApi()) {
      await backendRpc('assignments_clear_all', {}, getApiJwt());
    }
    set((s) => ({ assignments: [], sections: s.sections.map((sec) => ({ ...sec, headId: undefined, coHeadId: undefined })) }));
  },

  autoAssign: async () => {
    const report: AutoAssignReport = { assigned: 0, skipped: 0, vacancies: [], violations: [] };

    const minSlots = (dp: DutyPlace): number => Math.max(0, dp.minPrefects ?? 0);
    const maxSlots = (dp: DutyPlace): number => {
      // Avoid infinite fill when max=0 (unlimited): for auto-assignment we cap at minimum.
      if (dp.maxPrefects === 0) return minSlots(dp);
      return dp.maxPrefects || 1;
    };

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
        if (p.isHeadPrefect || p.isDeputyHeadPrefect || p.isGamesCaptain) return false;
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
      const candidates = getPool({ onlyUnassigned: true }).filter((p) => sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8);
      const best = pickBest(candidates);
      if (best) {
        const err = await get().setSectionHead(section.id, best.id);
        if (!err) report.assigned++;
        else { report.skipped++; report.violations.push(err); }
      }
      else { report.skipped++; report.vacancies.push({ placeName: `${section.name} Head`, slotsNeeded: 1 }); }
    }

    // Phase 2: Co-Section Heads
    for (const section of get().sections) {
      if (section.coHeadId) continue;
      const sectionGrade = getSectionGrade(section.name);
      const candidates = getPool({ onlyUnassigned: true }).filter((p) => {
        if (get().sections.some((s) => s.headId === p.id)) return false;
        return sectionGrade ? isEligibleHead(p.grade, sectionGrade) : p.grade >= 8;
      });
      const best = pickBest(candidates);
      if (best) {
        const err = await get().setSectionCoHead(section.id, best.id);
        if (!err) report.assigned++;
        else { report.skipped++; report.violations.push(err); }
      }
      else { report.skipped++; report.vacancies.push({ placeName: `${section.name} Co-Head`, slotsNeeded: 1 }); }
    }

    // Phase 3: Special duties
    const specialOrder = ['Main Gate (Gate A)', 'Shine Room', 'Gate B', 'Ground', 'Rock Plateau', 'Prefect Duty Inspection'];
    const specialPlaces = specialOrder.map((name) => get().dutyPlaces.find((dp) => dp.name === name)).filter(Boolean) as DutyPlace[];
    get().dutyPlaces.filter((dp) => dp.isSpecial && !specialOrder.includes(dp.name)).forEach((dp) => specialPlaces.push(dp));

    for (const dp of specialPlaces) {
      // Important: don't let specials consume all prefects.
      // Fill specials only up to their minimum required; leave extra prefects for classrooms.
      const targetSlots = minSlots(dp);
      if (targetSlots <= 0) continue;
      const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
      let slotsToFill = targetSlots - currentAssignments.length;
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
          if (best) {
            const err = await get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++;
            else { report.skipped++; report.violations.push(err); }
          }
          else { report.vacancies.push({ placeName: `${dp.name} (${needGender})`, slotsNeeded: 1 }); }
        } else {
          const best = pickBest(getPool({ gender: genderFilter, minGrade, onlyUnassigned: true }));
          if (best) {
            const err = await get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++;
            else { report.skipped++; report.violations.push(err); }
          }
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
          const max = maxSlots(dp);
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
            if (useCloudApi()) {
              try {
                await backendRpc(
                  'assignment_insert',
                  { id: newAssignment.id, prefect_id: best.id, duty_place_id: dp.id, assigned_by: 'auto' },
                  getApiJwt(),
                );
              } catch (e) {
                report.skipped++;
                report.violations.push(e instanceof Error ? e.message : 'Assignment failed');
                continue;
              }
            }
            set((s) => ({ assignments: [...s.assignments, newAssignment] }));
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

  autoFillRemaining: async () => {
    const report: AutoAssignReport = { assigned: 0, skipped: 0, vacancies: [], violations: [] };

    const minSlots = (dp: DutyPlace): number => Math.max(0, dp.minPrefects ?? 0);
    const maxSlots = (dp: DutyPlace): number => {
      // For "fill remaining", treat unlimited max as "fill to minimum" to avoid filling forever.
      if (dp.maxPrefects === 0) return minSlots(dp);
      return dp.maxPrefects || 1;
    };

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
        if (p.isHeadPrefect || p.isDeputyHeadPrefect || p.isGamesCaptain) return false;
        if (filter?.gender && p.gender !== filter.gender) return false;
        if (filter?.minGrade && p.grade < filter.minGrade) return false;
        if (filter?.onlyUnassigned && isAssigned(p.id)) return false;
        return true;
      });
    };

    // Fill duty places only (does not touch section heads/co-heads)
    const specialOrder = ['Main Gate (Gate A)', 'Shine Room', 'Gate B', 'Ground', 'Rock Plateau', 'Prefect Duty Inspection'];
    const specialPlaces = specialOrder.map((name) => get().dutyPlaces.find((dp) => dp.name === name)).filter(Boolean) as DutyPlace[];
    get().dutyPlaces.filter((dp) => dp.isSpecial && !specialOrder.includes(dp.name)).forEach((dp) => specialPlaces.push(dp));

    for (const dp of specialPlaces) {
      // Same priority rule: specials only to minimum, so classrooms aren't starved.
      const targetSlots = minSlots(dp);
      if (targetSlots <= 0) continue;
      const currentAssignments = get().assignments.filter((a) => a.dutyPlaceId === dp.id);
      let slotsToFill = targetSlots - currentAssignments.length;
      if (slotsToFill <= 0) continue;

      const genderReq = dp.genderRequirement;
      const gradeReqStr = dp.gradeRequirement;
      const minGrade = gradeReqStr ? Math.min(...gradeReqStr.split(',').map(Number)) : 10;
      const genderFilter = genderReq === 'M' ? 'Male' : genderReq === 'F' ? 'Female' : undefined;

      for (let i = 0; i < slotsToFill; i++) {
        if (dp.requiredGenderBalance) {
          const currentMales = get().assignments
            .filter((a) => a.dutyPlaceId === dp.id)
            .filter((a) => get().prefects.find((pr) => pr.id === a.prefectId)?.gender === 'Male').length;
          const currentFemales = get().assignments.filter((a) => a.dutyPlaceId === dp.id).length - currentMales;
          const needGender = currentMales <= currentFemales ? 'Male' : 'Female';
          const best = pickBest(getPool({ gender: needGender, minGrade, onlyUnassigned: true }));
          if (best) {
            const err = await get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
          } else {
            report.vacancies.push({ placeName: `${dp.name} (${needGender})`, slotsNeeded: 1 });
          }
        } else {
          const best = pickBest(getPool({ gender: genderFilter, minGrade, onlyUnassigned: true }));
          if (best) {
            const err = await get().assignPrefect(best.id, dp.id, dp.sectionId);
            if (!err) report.assigned++; else { report.skipped++; report.violations.push(err); }
          } else {
            report.vacancies.push({ placeName: dp.name, slotsNeeded: 1 });
          }
        }
      }
    }

    // Classroom duties
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
          const max = maxSlots(dp);
          if (max <= 0 || currentCount >= max) continue;

          const eligible = unassignedPool.filter((p) => {
            if (get().assignments.some((a) => a.prefectId === p.id)) return false;
            if (classGrade >= 11) return p.grade === 11;
            if (p.grade <= classGrade) return false;
            return true;
          });
          const best = pickBest(eligible);
          if (best) {
            const newAssignment: Assignment = { id: generateId(), prefectId: best.id, dutyPlaceId: dp.id, sectionId: dp.sectionId };
            if (useCloudApi()) {
              try {
                await backendRpc(
                  'assignment_insert',
                  { id: newAssignment.id, prefect_id: best.id, duty_place_id: dp.id, assigned_by: 'auto_fill' },
                  getApiJwt(),
                );
              } catch (e) {
                report.skipped++;
                report.violations.push(e instanceof Error ? e.message : 'Assignment failed');
                continue;
              }
            }
            set((s) => ({ assignments: [...s.assignments, newAssignment] }));
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

    const gamesCaptains = state.prefects.filter((p) => p.isGamesCaptain);
    if (gamesCaptains.length > MAX_GAMES_CAPTAINS) {
      issues.push({
        type: 'error',
        category: 'leadership_cap',
        message: `There are ${gamesCaptains.length} Games Captains; at most ${MAX_GAMES_CAPTAINS} are allowed — clear the role on ${gamesCaptains.length - MAX_GAMES_CAPTAINS} prefect(s)`,
      });
    }

    // Leadership constraints:
    // - A prefect may not lead more than one section
    // - A prefect with leadership may not have any duty assignment
    // - Leaders must be at least one grade above the section grade
    const leaderCount: Record<string, number> = {};
    for (const section of state.sections) {
      const sectionGrade = getSectionGrade(section.name);

      if (section.headId && section.coHeadId && section.headId === section.coHeadId) {
        const p = state.prefects.find((pr) => pr.id === section.headId);
        issues.push({
          type: 'error',
          category: 'single_duty',
          message: `${section.name} has the same prefect as Head and Co-Head${p ? ` (${p.name})` : ''} — not allowed`,
          prefectId: section.headId,
        });
      }

      for (const pid of [section.headId, section.coHeadId].filter(Boolean) as string[]) {
        leaderCount[pid] = (leaderCount[pid] || 0) + 1;
        const p = state.prefects.find((pr) => pr.id === pid);
        if (!p) continue;

        if (state.assignments.some((a) => a.prefectId === pid)) {
          issues.push({
            type: 'error',
            category: 'single_duty',
            message: `${p.name} has a duty assignment and a section leadership role — only one role allowed`,
            prefectId: pid,
          });
        }

        if (sectionGrade !== null && !isEligibleHead(p.grade, sectionGrade)) {
          issues.push({
            type: 'error',
            category: 'grade_mismatch',
            message: `${p.name} (Grade ${p.grade}) cannot lead ${section.name} — must be at least one grade above`,
            prefectId: pid,
          });
        }
      }
    }
    for (const [pid, count] of Object.entries(leaderCount)) {
      if (count > 1) {
        const p = state.prefects.find((pr) => pr.id === pid);
        if (p) {
          issues.push({
            type: 'error',
            category: 'single_duty',
            message: `${p.name} is assigned to ${count} leadership roles — only 1 allowed`,
            prefectId: pid,
          });
        }
      }
    }

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

  autoFixConflicts: async () => {
    const state = get();
    let clearedAssignments = 0;
    let clearedLeadership = 0;
    let fixedSameLeader = 0;

    // (A) Head and Co-Head cannot be the same person.
    for (const sec of state.sections) {
      if (sec.headId && sec.coHeadId && sec.headId === sec.coHeadId) {
        if (useCloudApi()) {
          await backendRpc('section_clear_co_head', { sectionId: sec.id }, getApiJwt());
        }
        fixedSameLeader++;
      }
    }

    // Build leader appearance map from current in-memory snapshot.
    // We are going to clear any duplicates by setting extra occurrences to null.
    const leaderAppearances: Record<string, { sectionId: string; field: 'head' | 'coHead' }[]> = {};
    for (const sec of state.sections) {
      if (sec.headId) (leaderAppearances[sec.headId] ||= []).push({ sectionId: sec.id, field: 'head' });
      if (sec.coHeadId) (leaderAppearances[sec.coHeadId] ||= []).push({ sectionId: sec.id, field: 'coHead' });
    }

    // (B) A prefect may lead only one section total. Keep first occurrence, clear the rest.
    for (const apps of Object.values(leaderAppearances)) {
      if (apps.length <= 1) continue;
      for (const app of apps.slice(1)) {
        if (useCloudApi()) {
          if (app.field === 'head') {
            await backendRpc('section_clear_head', { sectionId: app.sectionId }, getApiJwt());
          } else {
            await backendRpc('section_clear_co_head', { sectionId: app.sectionId }, getApiJwt());
          }
        }
        clearedLeadership++;
      }
    }

    // (C) Leaders cannot also have duty assignments — delete those assignments.
    const leaderIds = new Set(Object.keys(leaderAppearances));
    const leaderAssignmentIds = state.assignments.filter((a) => leaderIds.has(a.prefectId)).map((a) => a.id);
    if (leaderAssignmentIds.length > 0) {
      if (useCloudApi()) {
        try {
          await backendRpc('assignments_delete_ids', { ids: leaderAssignmentIds }, getApiJwt());
          clearedAssignments = leaderAssignmentIds.length;
        } catch {
          /* ignore */
        }
      }
    }

    await get().loadFromDB();
    return { clearedAssignments, clearedLeadership, fixedSameLeader };
  },

  getPrefectDuty: (prefectId) => get().assignments.find((a) => a.prefectId === prefectId),
  getAssignedPrefect: (dutyPlaceId) => get().assignments.filter((a) => a.dutyPlaceId === dutyPlaceId),

  getAvailablePrefects: () => {
    const state = get();
    return state.prefects
      .filter((p) => {
        if (p.isHeadPrefect || p.isDeputyHeadPrefect || p.isGamesCaptain) return false;
        if (state.assignments.some((a) => a.prefectId === p.id)) return false;
        if (state.sections.some((s) => s.headId === p.id || s.coHeadId === p.id)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  isSectionHeadOrCoHead: (prefectId) => get().sections.some((s) => s.headId === prefectId || s.coHeadId === prefectId),
  getPrefectPoints: (prefectId) => get().standingsPoints[prefectId] ?? BASE_STANDING_POINTS,
  applyPointChange: async (prefectIds, amount, reason) => {
    const trimmedReason = reason.trim();
    if (prefectIds.length === 0) return 'Select at least one prefect';
    if (!Number.isFinite(amount) || amount === 0) return 'Enter a non-zero point amount';
    if (!trimmedReason) return 'A log reason is required';

    const validPrefectIds = prefectIds.filter((prefectId) => get().prefects.some((prefect) => prefect.id === prefectId));
    if (validPrefectIds.length === 0) return 'Selected prefects were not found';

    const timestamp = new Date().toISOString();
    const newLogs: PointLog[] = validPrefectIds.map((prefectId) => ({
      id: generateId(),
      prefectId,
      amount,
      reason: trimmedReason,
      createdAt: timestamp,
    }));

    const nextPoints = { ...get().standingsPoints };
    validPrefectIds.forEach((prefectId) => {
      nextPoints[prefectId] = (nextPoints[prefectId] ?? BASE_STANDING_POINTS) + amount;
    });

    const nextLogs = [...newLogs, ...get().pointLogs];
    set({ standingsPoints: nextPoints, pointLogs: nextLogs });
    await persistStandingsState(nextPoints, nextLogs);
    return null;
  },
}));
