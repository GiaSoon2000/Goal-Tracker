/**
 * Goal templates — a small, transparent, local lookup table (no AI, no network).
 * Every field here is directly what ends up in an Activity/Milestone row; the
 * wizard's Plan Review step edits this same data before it is ever saved.
 * See PLANNING-ENGINE.md §2.
 */
import type { ActivityRole, ActivityScheduling, ActivityTarget, CanonicalUnit, GoalType, TrackKind } from '../types';

export interface ActivityDraft {
  name: string;
  kind: TrackKind;
  role: ActivityRole;
  unit: CanonicalUnit | null;
  decimals: 0 | 1 | 2;
  defaultTarget: ActivityTarget | null;
  scheduling: ActivityScheduling;
}

export interface MilestoneDraft {
  title: string;
  description?: string;
  /** Fraction of the timeline (0..1) where this milestone is suggested to land. */
  atFraction: number;
}

export interface GoalTemplate {
  id: string;
  label: string;
  appliesToType: GoalType;
  activities: ActivityDraft[];
  milestones: MilestoneDraft[];
  suggestedAvailableDaysPerWeek: number;
  suggestedWorkload: 'light' | 'moderate' | 'intense';
}

export const GOAL_TEMPLATES: Record<string, GoalTemplate> = {
  weightChange: {
    id: 'weightChange',
    label: 'Change my weight',
    appliesToType: 'metric',
    activities: [
      {
        name: 'Weight',
        kind: 'metric',
        role: 'outcome',
        unit: 'kg',
        decimals: 1,
        defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
        scheduling: { mode: 'none' },
      },
      {
        name: 'Workout',
        kind: 'session',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 3, band: { min: 2, max: 4 }, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] },
      },
    ],
    milestones: [],
    suggestedAvailableDaysPerWeek: 4,
    suggestedWorkload: 'moderate',
  },

  runningDistance: {
    id: 'runningDistance',
    label: 'Increase running distance',
    appliesToType: 'metric',
    activities: [
      {
        name: 'Longest run',
        kind: 'metric',
        role: 'outcome',
        unit: 'km',
        decimals: 1,
        defaultTarget: { aggregate: 'count', amount: 2, band: null, compare: null },
        scheduling: { mode: 'none' },
      },
      {
        name: 'Run',
        kind: 'session',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 3, band: { min: 2, max: 4 }, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 6], defaultMinutes: 30, stepTemplate: [] },
      },
    ],
    milestones: [],
    suggestedAvailableDaysPerWeek: 4,
    suggestedWorkload: 'moderate',
  },

  savings: {
    id: 'savings',
    label: 'Save money',
    appliesToType: 'metric',
    activities: [
      {
        name: 'Savings',
        kind: 'metric',
        role: 'outcome',
        unit: 'count',
        decimals: 0,
        defaultTarget: null,
        scheduling: { mode: 'none' },
      },
    ],
    milestones: [],
    suggestedAvailableDaysPerWeek: 1,
    suggestedWorkload: 'light',
  },

  singingPractice: {
    id: 'singingPractice',
    label: 'Practice singing',
    appliesToType: 'habit',
    activities: [
      {
        name: 'Practice',
        kind: 'duration',
        role: 'input',
        unit: 'min',
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 6, band: null, compare: null },
        scheduling: {
          mode: 'daysPerWeek',
          daysPerWeek: 6,
          preferredDays: [1, 2, 3, 4, 5, 6],
          defaultMinutes: 30,
          stepTemplate: [
            { title: 'Breathing', minutes: 5 },
            { title: 'Vocal warm-up', minutes: 10 },
            { title: 'Song practice', minutes: 15 },
          ],
        },
      },
    ],
    milestones: [],
    suggestedAvailableDaysPerWeek: 6,
    suggestedWorkload: 'moderate',
  },

  genericHabit: {
    id: 'genericHabit',
    label: 'Custom habit',
    appliesToType: 'habit',
    activities: [
      {
        name: 'Habit',
        kind: 'habit',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 5, band: null, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 5, preferredDays: [1, 2, 3, 4, 5], defaultMinutes: null, stepTemplate: [] },
      },
    ],
    milestones: [],
    suggestedAvailableDaysPerWeek: 5,
    suggestedWorkload: 'moderate',
  },

  pianoBeginner: {
    id: 'pianoBeginner',
    label: 'Learn piano',
    appliesToType: 'skill',
    activities: [
      {
        name: 'Practice session',
        kind: 'session',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 3, band: { min: 2, max: 4 }, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [2, 4, 6], defaultMinutes: 25, stepTemplate: [] },
      },
    ],
    milestones: [
      { title: 'Posture & hand position', atFraction: 0.05 },
      { title: 'Basic chords', atFraction: 0.2 },
      { title: 'Major scales', atFraction: 0.45 },
      { title: 'First song', atFraction: 0.7 },
      { title: 'Second song', atFraction: 1.0 },
    ],
    suggestedAvailableDaysPerWeek: 3,
    suggestedWorkload: 'light',
  },

  genericSkill: {
    id: 'genericSkill',
    label: 'Custom skill',
    appliesToType: 'skill',
    activities: [
      {
        name: 'Practice session',
        kind: 'session',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 30, stepTemplate: [] },
      },
    ],
    milestones: [
      { title: 'Milestone 1', atFraction: 0.33 },
      { title: 'Milestone 2', atFraction: 0.66 },
      { title: 'Milestone 3', atFraction: 1.0 },
    ],
    suggestedAvailableDaysPerWeek: 3,
    suggestedWorkload: 'moderate',
  },

  genericProject: {
    id: 'genericProject',
    label: 'Build something',
    appliesToType: 'project',
    activities: [
      {
        name: 'Work session',
        kind: 'session',
        role: 'input',
        unit: null,
        decimals: 0,
        defaultTarget: { aggregate: 'count', amount: 3, band: null, compare: null },
        scheduling: { mode: 'daysPerWeek', daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 60, stepTemplate: [] },
      },
    ],
    milestones: [
      { title: 'Milestone 1', atFraction: 0.33 },
      { title: 'Milestone 2', atFraction: 0.66 },
      { title: 'Milestone 3', atFraction: 1.0 },
    ],
    suggestedAvailableDaysPerWeek: 3,
    suggestedWorkload: 'moderate',
  },
};

export function templatesForType(type: GoalType): GoalTemplate[] {
  return Object.values(GOAL_TEMPLATES).filter((t) => t.appliesToType === type);
}
