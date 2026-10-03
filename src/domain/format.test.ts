import { describe, expect, it } from 'vitest';
import { targetDescription, targetUnitLabel } from './format';

describe('targetUnitLabel — disambiguating "3" for different activity shapes', () => {
  it('an outcome (logging-only) activity reads as logs/week', () => {
    const weight = { kind: 'metric' as const, role: 'outcome' as const, scheduling: { mode: 'none' as const } };
    expect(targetUnitLabel(weight, { aggregate: 'count' }, 3)).toBe('logs / week');
  });
  it('an input session activity reads as sessions/week', () => {
    const workout = { kind: 'session' as const, role: 'input' as const, scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] } };
    expect(targetUnitLabel(workout, { aggregate: 'count' }, 3)).toBe('sessions / week');
  });
  it('singularizes correctly when the amount is exactly 1', () => {
    const workout = { kind: 'session' as const, role: 'input' as const, scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] } };
    expect(targetUnitLabel(workout, { aggregate: 'count' }, 1)).toBe('session / week');
    const weight = { kind: 'metric' as const, role: 'outcome' as const, scheduling: { mode: 'none' as const } };
    expect(targetUnitLabel(weight, { aggregate: 'count' }, 1)).toBe('log / week');
  });
  it('a unit label (min, kg, etc.) never pluralizes', () => {
    const practice = { kind: 'duration' as const, role: 'input' as const, unit: 'min', scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 1, preferredDays: [1], defaultMinutes: 30, stepTemplate: [] } };
    expect(targetUnitLabel(practice, { aggregate: 'sum' }, 1)).toBe('min / week');
  });
  it('a sum-aggregate duration activity with a unit reads as that unit per week', () => {
    const practice = { kind: 'duration' as const, role: 'input' as const, unit: 'min', scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 6, preferredDays: [0, 1, 2, 3, 4, 5, 6], defaultMinutes: 30, stepTemplate: [] } };
    expect(targetUnitLabel(practice, { aggregate: 'sum' })).toBe('min / week');
  });
  it('a count-aggregate habit activity reads as days/week', () => {
    const habit = { kind: 'habit' as const, role: 'input' as const, scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 5, preferredDays: [1, 2, 3, 4, 5], defaultMinutes: null, stepTemplate: [] } };
    expect(targetUnitLabel(habit, { aggregate: 'count' })).toBe('days / week');
  });
});

describe('targetDescription — the practical difference between the two', () => {
  it('an outcome activity never generates a task', () => {
    const weight = { kind: 'metric' as const, role: 'outcome' as const, scheduling: { mode: 'none' as const } };
    expect(targetDescription(weight)).toMatch(/never generates a task/i);
  });
  it('an input activity with real scheduling DOES generate tasks', () => {
    const workout = { kind: 'session' as const, role: 'input' as const, scheduling: { mode: 'daysPerWeek' as const, daysPerWeek: 3, preferredDays: [1, 3, 5], defaultMinutes: 45, stepTemplate: [] } };
    expect(targetDescription(workout)).toMatch(/Generates a task/);
  });
  it('an input activity with scheduling.mode "none" is logged directly, no tasks', () => {
    const adHoc = { kind: 'habit' as const, role: 'input' as const, scheduling: { mode: 'none' as const } };
    expect(targetDescription(adHoc)).toMatch(/no tasks are generated/);
  });
});
