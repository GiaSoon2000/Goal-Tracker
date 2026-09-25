import s from '../GoalFormScreen.module.css';

export function CapacityStep({ availableDaysPerWeek, onChange }: { availableDaysPerWeek: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className={s.field}>
        <label className={s.label} htmlFor="days-per-week">
          Days available per week: {availableDaysPerWeek}
        </label>
        <input id="days-per-week" type="range" min={1} max={7} value={availableDaysPerWeek} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
      </div>
      <p className={s.hint}>The plan never asks for more sessions than this — see the suggestion on the next step.</p>
    </div>
  );
}
