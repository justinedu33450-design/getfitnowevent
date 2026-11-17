import {
  Bell,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Moon,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
} from 'lucide-react';
import { AppSection } from '../types';

interface TopBarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
  isSignedIn: boolean;
  isCoach: boolean;
  userDisplayName?: string | null;
  userPhotoUrl?: string | null;
  pendingCoachRequestsCount?: number;
  unreadCoachNotificationsCount?: number;
  unreadMemberNotificationsCount?: number;
  memberTrackingBadgeCount?: number;
  notificationsOpen?: boolean;
  onToggleNotifications?: () => void;
  onMemberSignIn: () => void;
  onCoachLogin: () => void;
  onCreateEvent: () => void;
}

export function TopBar({
  theme,
  onToggleTheme,
  activeSection,
  onNavigate,
  isSignedIn,
  isCoach,
  userDisplayName,
  userPhotoUrl,
  pendingCoachRequestsCount = 0,
  unreadCoachNotificationsCount = 0,
  unreadMemberNotificationsCount = 0,
  memberTrackingBadgeCount = 0,
  notificationsOpen = false,
  onToggleNotifications,
  onMemberSignIn,
  onCoachLogin,
  onCreateEvent,
}: TopBarProps) {
  const isDark = theme === 'dark';
  const themeToggleLabel = isDark
    ? 'Activer le mode clair'
    : 'Activer le mode sombre';

  const navItems: {
    id: AppSection;
    label: string;
    mobileLabel: string;
    icon: typeof CalendarDays;
    badge?: number;
  }[] = !isSignedIn
    ? [
        {
          id: 'calendar',
          label: 'Calendrier',
          mobileLabel: 'Calendrier',
          icon: CalendarDays,
        },
        {
          id: 'sessions',
          label: 'Séances',
          mobileLabel: 'Séances',
          icon: Dumbbell,
        },
      ]
    : isCoach
      ? [
          {
            id: 'calendar',
            label: 'Calendrier',
            mobileLabel: 'Calendrier',
            icon: CalendarDays,
          },
          {
            id: 'sessions',
            label: 'Séances',
            mobileLabel: 'Séances',
            icon: Dumbbell,
          },
          {
            id: 'members',
            label: 'Adhérents',
            mobileLabel: 'Adhérents',
            icon: Users,
          },
          {
            id: 'manage',
            label: 'Gestion',
            mobileLabel: 'Gestion',
            icon: ClipboardList,
          },
          {
            id: 'coaches',
            label: 'Coachs',
            mobileLabel: 'Coachs',
            icon: ShieldCheck,
            badge:
              pendingCoachRequestsCount > 0
                ? pendingCoachRequestsCount
                : undefined,
          },
        ]
      : [
          {
            id: 'calendar',
            label: 'Calendrier',
            mobileLabel: 'Calendrier',
            icon: CalendarDays,
          },
          {
            id: 'sessions',
            label: 'Séances',
            mobileLabel: 'Séances',
            icon: Dumbbell,
          },
          {
            id: 'member-profile',
            label: 'Mon suivi',
            mobileLabel: 'Mon suivi',
            icon: UserCheck,
            badge:
              memberTrackingBadgeCount > 0
                ? memberTrackingBadgeCount
                : undefined,
          },
        ];

  const themeToggleButton = (
    <button
      type="button"
      onClick={onToggleTheme}
      aria-label={themeToggleLabel}
      title={themeToggleLabel}
      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:gap-8 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer sm:text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded"
          >
            GetFitNow Event
          </button>

          {/* Zone 2: Navigation links (Desktop) */}
          {navItems.length > 0 && (
            <nav
              aria-label="Navigation principale"
              className="hidden md:flex items-center gap-5 lg:gap-7 text-sm font-medium"
            >
              {navItems.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={`relative inline-flex items-center gap-1.5 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded ${
                      isActive
                        ? 'text-slate-900 font-semibold dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        aria-label={`${item.badge} notification(s)`}
                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[11px] font-bold text-white tabular-nums shadow-xs"
                      >
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-[19px] h-0.5 bg-emerald-600 dark:bg-emerald-500"
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Zone 3: Primary Actions + Theme Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {themeToggleButton}

            {isSignedIn &&
              (isCoach ? (
                <div className="flex items-center gap-2 shrink-0">
                  {onToggleNotifications && (
                    <button
                      type="button"
                      onClick={onToggleNotifications}
                      aria-label={
                        unreadCoachNotificationsCount > 0
                          ? `${unreadCoachNotificationsCount} notification(s) d’inscription non lue(s)`
                          : 'Ouvrir les notifications d’inscription'
                      }
                      className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                        notificationsOpen
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                      }`}
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      {unreadCoachNotificationsCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-bold text-white tabular-nums ring-2 ring-white dark:ring-slate-900 shadow-xs">
                          {unreadCoachNotificationsCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  {onToggleNotifications && (
                    <button
                      type="button"
                      onClick={onToggleNotifications}
                      aria-label={
                        unreadMemberNotificationsCount > 0
                          ? `${unreadMemberNotificationsCount} notification(s) en attente`
                          : 'Ouvrir les notifications'
                      }
                      className={`relative flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                        notificationsOpen
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                      }`}
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      {unreadMemberNotificationsCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 font-mono text-[10px] font-bold text-white tabular-nums ring-2 ring-white dark:ring-slate-900 shadow-xs">
                          {unreadMemberNotificationsCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (Thumb-zone navigation, <= 15% total sticky height) */}
      {navItems.length > 0 && (
        <nav
          aria-label="Navigation mobile"
          className={`fixed bottom-0 left-0 right-0 z-40 grid h-16 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 md:hidden ${
            !isSignedIn ? 'grid-cols-2' : isCoach ? 'grid-cols-5' : 'grid-cols-3'
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative flex min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.badge !== undefined && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums ring-2 ring-white dark:ring-slate-900">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] sm:text-[11px] font-medium whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
