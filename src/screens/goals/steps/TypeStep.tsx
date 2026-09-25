import type { GoalTemplate } from '../../../domain/planner/templates';
import type { GoalType } from '../../../domain/types';
import { cls } from '../../../ui/cls';
import s from '../GoalFormScreen.module.css';

const TYPES: { value: GoalType; label: string; hint: string }[] = [
  { value: 'metric', label: 'Metric', hint: 'A number to change — weight, distance, savings' },
  { value: 'habit', label: 'Habit', hint: 'A recurring action — practice, workouts' },
  { value: 'skill', label: 'Skill', hint: 'Learning something — an instrument, a language' },
  { value: 'project', label: 'Project', hint: 'A multi-stage build with milestones' },
];

export function TypeStep({ type, onTypeChange, templates, templateId, onTemplateChange }: { type: GoalType; onTypeChange: (t: GoalType) => void; templates: GoalTemplate[]; templateId: string; onTemplateChange: (id: string) => void }) {
  return (
    <div>
      <div className={s.field}>
        <span className={s.label}>What kind of goal?</span>
        <div className={s.segmented}>
          {TYPES.map((t) => (
            <button key={t.value} type="button" className={cls(s.segmentButton, type === t.value && s.active)} onClick={() => onTypeChange(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <p className={s.hint}>{TYPES.find((t) => t.value === type)?.hint}</p>
      </div>

      {templates.length > 0 && (
        <div className={s.field}>
          <label className={s.label} htmlFor="goal-template">
            Starting point
          </label>
          <select id="goal-template" className={s.select} value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
