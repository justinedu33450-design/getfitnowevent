import {
  Bell,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sun,
  SunMoon,
  UserCheck,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppSection } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

function MobileNavIcon({
  id,
  outlineIcon: OutlineIcon,
  active,
}: {
  id: AppSection;
  outlineIcon: typeof CalendarDays;
  active: boolean;
}) {
  if (!active) {
    return (
      <OutlineIcon
        className="h-6 w-6"
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  switch (id) {
    case 'calendar':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm-3 8v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9H5Zm3.25 3a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm3.75 0a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2H12Zm3.75 0a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm-7.5 3.5a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm3.75 0a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2H12Z"
          />
        </svg>
      );
    case 'sessions':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <g transform="rotate(-45 12 12)">
            <rect x="8.5" y="10.75" width="7" height="2.5" rx="1" />
            <rect x="5.75" y="7" width="3" height="10" rx="1.25" />
            <rect x="2.75" y="8.5" width="2.35" height="7" rx="1.1" />
            <rect x="1.1" y="10.75" width="1.3" height="2.5" rx="0.65" />
            <rect x="15.25" y="7" width="3" height="10" rx="1.25" />
            <rect x="18.9" y="8.5" width="2.35" height="7" rx="1.1" />
            <rect x="21.6" y="10.75" width="1.3" height="2.5" rx="0.65" />
          </g>
        </svg>
      );
    case 'members':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="9" cy="7.5" r="3.5" />
          <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0v.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-.5Z" />
          <circle cx="16.5" cy="8.5" r="2.75" />
          <path d="M16.5 13c2.8 0 5 1.9 5 4.75V19a1 1 0 0 1-1 1h-3.2a7.7 7.7 0 0 0-1.6-4.7 4.7 4.7 0 0 1 .8-2.3Z" />
        </svg>
      );
    case 'messages':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8.4L3.7 21.7A1 1 0 0 1 2 20.9V5a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case 'manage':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9 2a1 1 0 0 0-1 1v1H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V3a1 1 0 0 0-1-1H9Zm1 2h4v1h-4V4Zm-1.75 5.25a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm3.75.25a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2h-4Zm-3.75 3.75a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01Zm3.75.25a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2h-4Z"
          />
        </svg>
      );
    case 'coaches':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2.2a1 1 0 0 1 .45.11l7 3.5a1 1 0 0 1 .55.89v4.8c0 5.14-3.36 8.98-7.68 10.42a1 1 0 0 1-.64 0C7.36 20.48 4 16.64 4 11.5V6.7a1 1 0 0 1 .55-.89l7-3.5a1 1 0 0 1 .45-.11Zm3.7 7.1a1 1 0 0 0-1.4-1.42L11 11.17l-1.3-1.29a1 1 0 0 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
          />
        </svg>
      );
    case 'member-profile':
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="9.5" cy="7.5" r="3.75" />
          <path d="M2.5 19.5a7 7 0 0 1 14 0v.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-.5Z" />
          <path d="m16.2 12.2 1.8 1.8 3.6-3.6a1 1 0 1 1 1.4 1.4l-4.3 4.3a1 1 0 0 1-1.4 0l-2.5-2.5a1 1 0 1 1 1.4-1.4Z" />
        </svg>
      );
    default:
      return (
        <OutlineIcon
          className="h-6 w-6"
          strokeWidth={2}
          aria-hidden="true"
        />
      );
  }
}

interface TopBarProps {
  theme: 'auto' | 'light' | 'dark';
  resolvedTheme: 'light' | 'dark';
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
  unreadMessagesCount?: number;
  memberTrackingBadgeCount?: number;
  notificationsOpen?: boolean;
  onToggleNotifications?: () => void;
  onMemberSignIn: () => void;
  onCoachLogin: () => void;
  onCreateEvent: () => void;
}

export function TopBar({
  theme,
  resolvedTheme,
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
  unreadMessagesCount = 0,
  memberTrackingBadgeCount = 0,
  notificationsOpen = false,
  onToggleNotifications,
  onMemberSignIn,
  onCoachLogin,
  onCreateEvent,
}: TopBarProps) {
  const themeShortLabel =
    theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Sombre' : 'Clair';
  const themeToggleLabel =
    theme === 'auto'
      ? `Mode automatique (${resolvedTheme === 'dark' ? 'sombre' : 'clair'}) — passer en mode clair`
      : theme === 'light'
        ? 'Mode clair — passer en mode sombre'
        : 'Mode sombre — passer en mode automatique';

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
            id: 'messages',
            label: 'Messagerie',
            mobileLabel: 'Messages',
            icon: MessageSquare,
            badge:
              unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
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
            id: 'messages',
            label: 'Messagerie',
            mobileLabel: 'Messages',
            icon: MessageSquare,
            badge:
              unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
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
      className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A] dark:hover:text-[#E5E5E5] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616]"
    >
      {theme === 'auto' ? (
        <SunMoon
          className="h-4 w-4 shrink-0 text-emerald-600 dark:text-[#4ADE80]"
          aria-hidden="true"
        />
      ) : theme === 'dark' ? (
        <Moon
          className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-300"
          aria-hidden="true"
        />
      ) : (
        <Sun
          className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400"
          aria-hidden="true"
        />
      )}
      <span className="hidden sm:inline">{themeShortLabel}</span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-[#262626] dark:bg-[#161616]/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:gap-8 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-[#E5E5E5] whitespace-nowrap shrink-0 cursor-pointer sm:text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] rounded-[10px]"
          >
            <span className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 overflow-hidden rounded-[10px] bg-black ring-1 ring-slate-900/10 dark:ring-[#262626]">
              <img
                src="/assets/aistudio/logo_GE_b0b4d3a2.png"
                alt="Logo GetFitNow Event"
                className="h-full w-full object-contain"
              />
            </span>
            <span>GetFitNow Event</span>
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
                    className={`relative inline-flex items-center gap-1.5 py-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] rounded ${
                      isActive
                        ? 'text-slate-900 font-semibold dark:text-[#E5E5E5]'
                        : 'text-slate-600 hover:text-slate-900 dark:text-[#8E8E8E] dark:hover:text-[#E5E5E5]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        aria-label={`${item.badge} notification(s)`}
                        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white tabular-nums shadow-xs"
                      >
                        {item.badge}
                      </span>
                    )}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 -bottom-[19px] h-0.5 bg-emerald-600 dark:bg-[#4ADE80]"
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Zone 3: Primary Actions + Theme Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
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
                      className={`relative flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616] ${
                        notificationsOpen
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-[#4ADE80]/40 dark:bg-[#4ADE80]/15 dark:text-[#4ADE80] dark:hover:bg-[#4ADE80]/25'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A] dark:hover:text-[#E5E5E5]'
                      }`}
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      {unreadCoachNotificationsCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums ring-2 ring-white dark:ring-[#161616] shadow-xs">
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
                      className={`relative flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#161616] ${
                        notificationsOpen
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-[#4ADE80]/40 dark:bg-[#4ADE80]/15 dark:text-[#4ADE80] dark:hover:bg-[#4ADE80]/25'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-[#262626] dark:bg-[#1F1F1F] dark:text-[#E5E5E5] dark:hover:bg-[#2A2A2A] dark:hover:text-[#E5E5E5]'
                      }`}
                    >
                      <Bell className="h-4 w-4" aria-hidden="true" />
                      {unreadMemberNotificationsCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white tabular-nums ring-2 ring-white dark:ring-[#161616] shadow-xs">
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

      {/* Mobile Floating Glassmorphism Pill Navigation */}
      {navItems.length > 0 && (
        <nav
          aria-label="Navigation mobile"
          className={`glass-pill-nav fixed bottom-[max(0.875rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 rounded-full p-2.5 md:hidden ${
            navItems.length <= 2
              ? 'grid w-[calc(100%-1.5rem)] max-w-md grid-cols-2 gap-2'
              : navItems.length <= 4
                ? 'grid w-[calc(100%-1.25rem)] max-w-lg grid-cols-4 gap-1.5'
                : 'grid w-[calc(100%-1rem)] max-w-xl grid-cols-6 gap-1'
          }`}
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={`relative z-10 flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/60 dark:focus-visible:ring-white/80 ${
                  navItems.length <= 2 ? 'px-5 py-2' : 'px-1.5 py-2'
                } ${
                  isActive
                    ? 'text-slate-950 dark:text-white'
                    : 'text-slate-700/75 hover:text-slate-950 dark:text-white/65 dark:hover:text-white/90'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-active-pill"
                    transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-full bg-slate-900/[0.09] ring-1 ring-inset ring-slate-900/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-slate-200/[0.16] dark:ring-white/15 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                  />
                )}
                <div className="relative z-10 flex items-center justify-center">
                  <MobileNavIcon
                    id={item.id}
                    outlineIcon={item.icon}
                    active={isActive}
                  />
                  {item.badge !== undefined && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-white/90 dark:bg-rose-500 dark:ring-slate-900/90 shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`relative z-10 whitespace-nowrap leading-tight ${
                    navItems.length >= 6 ? 'text-[10px]' : 'text-[11px]'
                  } ${
                    isActive
                      ? 'font-semibold text-slate-950 dark:text-white'
                      : 'font-medium text-slate-700/80 dark:text-white/70'
                  }`}
                >
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
