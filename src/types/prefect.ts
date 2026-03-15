export type Gender = 'Male' | 'Female';
export type Level = 'Junior' | 'Senior';

export interface Prefect {
  id: string;
  name: string;
  regNo: string;
  grade: number; // 4-11
  gender: Gender;
  level: Level; // auto: grade <= 7 = Junior, else Senior
  isHeadPrefect?: boolean;
  isDeputyHeadPrefect?: boolean;
}

export interface DutyPlace {
  id: string;
  name: string;
  sectionId: string;
  isSpecial?: boolean;
  isMandatory?: boolean;
  requiredGenderBalance?: boolean;
  maxPrefects?: number;
  genderRequirement?: string;
  gradeRequirement?: string;
  sameGradeIfMultiple?: boolean;
  mandatorySlots?: number;
}

export interface Section {
  id: string;
  name: string;
  headId?: string; // male prefect
  coHeadId?: string; // female prefect
  dutyPlaceIds: string[];
}

export interface Assignment {
  id: string;
  prefectId: string;
  dutyPlaceId: string;
  sectionId: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  category: 'grade_mismatch' | 'single_duty' | 'gender_violation' | 'vacant_mandatory' | 'same_age';
  message: string;
  prefectId?: string;
  dutyPlaceId?: string;
}

export const GRADE_RANGE = [4, 5, 6, 7, 8, 9, 10, 11] as const;

export function calculateLevel(grade: number): Level {
  return grade <= 7 ? 'Junior' : 'Senior';
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Default sections and duty places
export const DEFAULT_SECTIONS: Omit<Section, 'dutyPlaceIds'>[] = [
  { id: 'grade4', name: 'GRADE 4' },
  { id: 'grade5', name: 'GRADE 5' },
  { id: 'grade6', name: 'GRADE 6' },
  { id: 'grade7', name: 'GRADE 7' },
  { id: 'grade8', name: 'GRADE 8' },
  { id: 'grade9', name: 'GRADE 9' },
  { id: 'grade10', name: 'GRADE 10' },
  { id: 'grade11', name: 'GRADE 11' },
  { id: 'sectionA', name: 'SECTION A' },
  { id: 'sectionB', name: 'SECTION B' },
];

export const DEFAULT_DUTY_PLACES: Omit<DutyPlace, 'id'>[] = [
  // Classrooms
  { name: '4A', sectionId: 'grade4', isMandatory: true },
  { name: '4B', sectionId: 'grade4', isMandatory: true },
  { name: '4C', sectionId: 'grade4' },
  { name: '4D', sectionId: 'grade4' },
  { name: '4E', sectionId: 'grade4' },
  { name: '5A', sectionId: 'grade5', isMandatory: true },
  { name: '5B', sectionId: 'grade5', isMandatory: true },
  { name: '5C', sectionId: 'grade5' },
  { name: '5D', sectionId: 'grade5' },
  { name: '5E', sectionId: 'grade5' },
  { name: '6A', sectionId: 'grade6', isMandatory: true },
  { name: '6B', sectionId: 'grade6', isMandatory: true },
  { name: '6C', sectionId: 'grade6' },
  { name: '6D', sectionId: 'grade6' },
  { name: '6E', sectionId: 'grade6' },
  { name: '7A', sectionId: 'grade7', isMandatory: true },
  { name: '7B', sectionId: 'grade7', isMandatory: true },
  { name: '7C', sectionId: 'grade7' },
  { name: '7D', sectionId: 'grade7' },
  { name: '7E', sectionId: 'grade7' },
  { name: '8A', sectionId: 'grade8', isMandatory: true },
  { name: '8B', sectionId: 'grade8', isMandatory: true },
  { name: '8C', sectionId: 'grade8' },
  { name: '8D', sectionId: 'grade8' },
  { name: '8E', sectionId: 'grade8' },
  { name: '9A', sectionId: 'grade9', isMandatory: true },
  { name: '9B', sectionId: 'grade9', isMandatory: true },
  { name: '9C', sectionId: 'grade9' },
  { name: '9D', sectionId: 'grade9' },
  { name: '9E', sectionId: 'grade9' },
  { name: '10A', sectionId: 'grade10', isMandatory: true },
  { name: '10B', sectionId: 'grade10', isMandatory: true },
  { name: '10C', sectionId: 'grade10' },
  { name: '10D', sectionId: 'grade10' },
  { name: '10E', sectionId: 'grade10' },
  { name: '11A', sectionId: 'grade11', isMandatory: true },
  { name: '11B', sectionId: 'grade11', isMandatory: true },
  { name: '11C', sectionId: 'grade11' },
  { name: '11D', sectionId: 'grade11' },
  { name: '11E', sectionId: 'grade11' },
  // Section A specials
  { name: 'Main Gate (Gate A)', sectionId: 'sectionA', isSpecial: true, isMandatory: true, requiredGenderBalance: true, maxPrefects: 2 },
  { name: 'Shine Room', sectionId: 'sectionA', isSpecial: true, isMandatory: true, requiredGenderBalance: true, maxPrefects: 2 },
  // Section B specials
  { name: 'Rock Plateau', sectionId: 'sectionB', isSpecial: true, isMandatory: true },
  { name: 'Gate B', sectionId: 'sectionB', isSpecial: true, isMandatory: true, requiredGenderBalance: true, maxPrefects: 2 },
  { name: 'Ground', sectionId: 'sectionB', isSpecial: true, isMandatory: true, requiredGenderBalance: true, maxPrefects: 2 },
  // Inspection
  { name: 'Prefect Duty Inspection', sectionId: 'sectionA', isSpecial: true, isMandatory: true, maxPrefects: 2 },
];
