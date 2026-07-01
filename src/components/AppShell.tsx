import React, { useState } from 'react';
import {
  LayoutDashboard,
  Plus,
  Settings,
  Search,
  Moon,
  Sun,
  Menu,
} from 'lucide-react';
import Logo from './Logo';
import type { Page } from '../App';
import { useTheme } from '../theme';
import { PlayerBar } from './PlayerBar';
import { cx } from './ds';

type NavId = Extract<Page, 'dashboard' | 'create' | 'settings'>;
type LabelMode = 'responsive' | 'always';

const NAV: { id: NavId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'create', label: '새 회의', icon: Plus },
  { id: 'settings', label: '설정', icon: Settings },
];

// label/alignment classes derived from the label mode.
// NOTE: must be literal strings so Tailwind's scanner generates them.
const labelCls = (mode: LabelMode) => (mode === 'always' ? 'block' : 'hidden lg:block');
const rowJustify = (mode: LabelMode) =>
  mode === 'always' ? 'justify-start' : 'justify-center lg:justify-start';

function NavList({
  active,
  onNavigate,
  mode,
}: {
  active: NavId | null;
  onNavigate: (p: Page) => void;
  mode: LabelMode;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cx(
              'relative flex items-center gap-2.5 h-[34px] rounded-control px-2.5 transition-colors focus-ring',
              rowJustify(mode),
              isActive ? 'bg-subtle text-accent' : 'text-ink-soft hover:bg-subtle hover:text-ink'
            )}
            title={label}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-accent" />
            )}
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className={cx('text-sm font-medium', labelCls(mode))}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ThemeToggle({ mode }: { mode: LabelMode }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button
      onClick={toggle}
      className={cx(
        'flex items-center gap-2.5 h-[34px] rounded-control px-2.5 text-ink-soft hover:bg-subtle hover:text-ink transition-colors focus-ring',
        rowJustify(mode)
      )}
      title={dark ? '라이트 모드' : '다크 모드'}
    >
      {dark ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
      <span className={cx('text-sm font-medium', labelCls(mode))}>
        {dark ? '라이트 모드' : '다크 모드'}
      </span>
    </button>
  );
}

function CommandButton({ onClick, mode }: { onClick: () => void; mode: LabelMode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex items-center gap-2.5 h-[34px] rounded-control px-2.5 text-ink-soft hover:bg-subtle hover:text-ink transition-colors focus-ring',
        rowJustify(mode)
      )}
      title="명령 팔레트 (⌘K)"
    >
      <Search className="w-4 h-4 flex-shrink-0" />
      <span className={cx('text-sm font-medium', labelCls(mode))}>검색</span>
      <kbd
        className={cx(
          'ml-auto text-[11px] font-mono text-ink-faint bg-muted border border-line rounded px-1.5 py-0.5',
          labelCls(mode)
        )}
      >
        ⌘K
      </kbd>
    </button>
  );
}

function SidebarInner({
  active,
  onNavigate,
  onOpenCommand,
  mode,
}: {
  active: NavId | null;
  onNavigate: (p: Page) => void;
  onOpenCommand: () => void;
  mode: LabelMode;
}) {
  return (
    <div className="flex flex-col h-full w-full">
      <button
        onClick={() => onNavigate('landing')}
        className={cx('flex items-center gap-2 h-14 px-4 flex-shrink-0 focus-ring hover:opacity-80 transition-opacity', rowJustify(mode))}
        title="OpenScribe 홈으로"
      >
        <Logo size={28} title="OpenScribe" className="text-ink flex-shrink-0" />
        <span className={cx('font-semibold text-ink', labelCls(mode))}>OpenScribe</span>
      </button>

      <div className="mt-2">
        <NavList active={active} onNavigate={onNavigate} mode={mode} />
      </div>

      <div className="mt-auto px-2 pb-3 flex flex-col gap-0.5">
        <CommandButton onClick={onOpenCommand} mode={mode} />
        <ThemeToggle mode={mode} />
        <div className={cx('px-2.5 pt-3 text-[11px] text-ink-faint leading-snug', labelCls(mode))}>
          Open-source meeting
          <br />
          transcription &amp; notes
        </div>
      </div>
    </div>
  );
}

interface AppShellProps {
  active: NavId | null;
  onNavigate: (page: Page) => void;
  onOpenCommand: () => void;
  children: React.ReactNode;
}

export function AppShell({ active, onNavigate, onOpenCommand, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigateAndClose = (p: Page) => {
    setDrawerOpen(false);
    onNavigate(p);
  };

  return (
    <div className="h-dvh flex bg-canvas overflow-hidden">
      {/* Desktop sidebar: icon rail (md) → full 240px (lg) */}
      <aside className="hidden md:flex md:w-14 lg:w-60 flex-shrink-0 border-r border-line bg-surface overflow-y-auto">
        <SidebarInner
          active={active}
          onNavigate={onNavigate}
          onOpenCommand={onOpenCommand}
          mode="responsive"
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-60 bg-surface border-r border-line shadow-modal">
            <SidebarInner
              active={active}
              onNavigate={navigateAndClose}
              onOpenCommand={() => {
                setDrawerOpen(false);
                onOpenCommand();
              }}
              mode="always"
            />
          </div>
        </div>
      )}

      {/* Main column — flex: mobile bar / scrollable main / player */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex-shrink-0 flex items-center gap-3 h-12 px-3 bg-surface border-b border-line">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-control text-ink-soft hover:bg-subtle focus-ring"
            title="메뉴"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2 focus-ring rounded-control hover:opacity-80 transition-opacity"
            title="OpenScribe 홈으로"
          >
            <Logo size={24} className="text-ink flex-shrink-0" />
            <span className="font-semibold text-ink text-sm">OpenScribe</span>
          </button>
          <button
            onClick={onOpenCommand}
            className="ml-auto w-9 h-9 flex items-center justify-center rounded-control text-ink-soft hover:bg-subtle focus-ring"
            title="검색 (⌘K)"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">{children}</main>
        <PlayerBar />
      </div>
    </div>
  );
}
