import { cls } from '../../ui/cls';
import s from './WizardHeader.module.css';

/** The 5-step wizard's header (UX-FLOWS.md §7): back · progress dots · Next/Create. */
export function WizardHeader({ step, stepCount, onBack, onNext, nextLabel, nextDisabled }: { step: number; stepCount: number; onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled: boolean }) {
  return (
    <header className={s.header}>
      <button type="button" className={s.back} onClick={onBack} aria-label="Back">
        ‹
      </button>
      <div className={s.dots} role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={stepCount} aria-label={`Step ${step + 1} of ${stepCount}`}>
        {Array.from({ length: stepCount }, (_, i) => (
          <span key={i} className={cls(s.dot, i === step && s.dotActive)} aria-current={i === step ? 'step' : undefined} />
        ))}
      </div>
      <button type="button" className={s.next} onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </button>
    </header>
  );
}
