import React from 'react';
import { getSpeakerColorVar } from '../lib/speakers';
import type { MeetingRecord } from '../App';

/** tiny class joiner */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ───────────────────────── Button ───────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-active',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle',
  ghost: 'bg-transparent text-ink-soft hover:bg-subtle',
  danger: 'bg-transparent text-danger border border-line hover:bg-danger-subtle',
  'danger-solid': 'bg-danger text-white hover:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-8 px-3.5 text-sm gap-2',
  lg: 'h-10 px-[18px] text-[15px] gap-2',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        // 풀-필(50px) + press scale(0.97) = 스타벅스 시그니처 마이크로 인터랙션
        'inline-flex items-center justify-center rounded-full font-medium',
        'transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.97]',
        'focus-ring disabled:opacity-50 disabled:cursor-not-allowed',
        'whitespace-nowrap',
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── IconButton ───────────────────────── */

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({ size = 'md', active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center rounded-full transition-[background-color,transform] duration-150 focus-ring active:scale-95',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'w-7 h-7' : 'w-8 h-8',
        active ? 'bg-accent text-white' : 'text-ink-soft hover:bg-subtle',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── StatusBadge ───────────────────────── */

type Status = MeetingRecord['status'];

const STATUS_META: Record<Status, { label: string; text: string; bg: string; dot: string; pulse?: boolean }> = {
  queued: { label: '대기중', text: 'text-ink-faint', bg: 'bg-subtle', dot: 'bg-ink-faint' },
  processing: { label: '처리중', text: 'text-accent', bg: 'bg-accent-subtle', dot: 'bg-accent', pulse: true },
  completed: { label: '완료', text: 'text-success', bg: 'bg-success-subtle', dot: 'bg-success' },
  failed: { label: '실패', text: 'text-danger', bg: 'bg-danger-subtle', dot: 'bg-danger' },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const m = STATUS_META[status] ?? STATUS_META.queued;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-medium text-[13px] py-0.5 pl-1.5 pr-2',
        m.text,
        m.bg,
        className
      )}
    >
      <span className={cx('w-1.5 h-1.5 rounded-full', m.dot, m.pulse && 'pulse-dot')} />
      {m.label}
    </span>
  );
}

/* ───────────────────────── SpeakerChip ───────────────────────── */

interface SpeakerChipProps {
  speaker: string;
  label: string;
  onClick?: () => void;
  className?: string;
}

export function SpeakerChip({ speaker, label, onClick, className }: SpeakerChipProps) {
  const style = { ['--spk' as string]: getSpeakerColorVar(speaker) } as React.CSSProperties;
  const content = (
    <>
      <span className="speaker-dot" />
      {label}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={style}
        className={cx('speaker-chip focus-ring hover:opacity-80 transition-opacity', className)}
        title="클릭해 화자 이름 변경"
      >
        {content}
      </button>
    );
  }
  return (
    <span style={style} className={cx('speaker-chip', className)}>
      {content}
    </span>
  );
}

/* ───────────────────────── Segmented control ───────────────────────── */

interface SegmentedProps<T extends string> {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={cx('inline-flex gap-0.5 bg-subtle p-1 rounded-full', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cx(
            'rounded-full font-medium transition-colors focus-ring',
            size === 'sm' ? 'px-2.5 py-1 text-[13px]' : 'px-3 py-1.5 text-sm',
            value === opt.value
              ? 'bg-surface text-accent shadow-card'
              : 'text-ink-soft hover:text-ink'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
