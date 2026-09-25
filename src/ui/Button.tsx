import type { ButtonHTMLAttributes } from 'react';
import { cls } from './cls';
import s from './Button.module.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export function Button({ variant = 'secondary', className, ...rest }: Props) {
  return <button type="button" className={cls(s.button, s[variant], className)} {...rest} />;
}
