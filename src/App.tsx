import { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { APIProvider } from '@vis.gl/react-google-maps';
import { auth, BOOTSTRAPPED_COACH_EMAIL, googleProvider } from './firebase';
import {
  autoDeleteCancelledEvent,
  cancelMyRegistration,
  completeEndedEventAndNotifyMembers,
  deleteCoachNotification,
  deleteMemberNotification,
  ensureMyMemberProfile,
  ensureSessionValidationNotification,
  markAllCoachNotificationsRead,
  markAllMemberNotificationsRead,
  markCoachNotificationRead,
  markMemberNotificationRead,
  resolveCoachSession,
  subscribeCoachAccessRequests,
  subscribeCoachAdmins,
  subscribeCoachInvites,
  subscribeDisciplines,
  subscribeEvents,
  subscribeMembers,
  subscribeMyAdminStatus,
  subscribeMyCoachAccessRequest,
  subscribeMyCoachNotifications,
  subscribeMyMemberNotifications,
  subscribeMyMemberProfile,
  subscribeMyRegistrations,
  subscribeRegistrations,
  validateMemberSession,
} from './services/firestoreService';
import { formatFirebaseAuthError } from './services/authService';
import {
  AppSection,
  CoachAccessRequest,
  CoachAccessResolution,
  CoachAdminInvite,
  CoachAdminUser,
  CoachNotification,
  CoachRole,
  CustomDiscipline,
  MemberNotification,
  MemberProfile,
  Registration,
  SportEvent,
} from './types';
import { buildDisciplineCatalog } from './utils/disciplineColors';
import {
  evaluateEventBooking,
  getRegistrationEndMs,
} from './utils/dateAndValidation';
import { TopBar } from './components/TopBar';
import { CoachNotificationsBar } from './components/CoachNotificationsBar';
import { MemberNotificationsBar } from './components/MemberNotificationsBar';
import { HeroSection } from './components/HeroSection';
import { CalendarView } from './components/CalendarView';
import { SessionsListView } from './components/SessionsListView';
import { BookingModal } from './components/BookingModal';
import { EventFormModal } from './components/EventFormModal';
import { EventRosterDrawer } from './components/EventRosterDrawer';
import { CoachEventsView } from './components/CoachEventsView';
import { MembersTrackingView } from './components/MembersTrackingView';
import { CoachesAdminView } from './components/CoachesAdminView';
import { CoachAuthGate } from './components/CoachAuthGate';
import { MemberAuthGate } from './components/MemberAuthGate';
import { MemberPortalView } from './components/MemberPortalView';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAPS_LIBRARIES = ['places', 'marker', 'core'];
const THEME_STORAGE_KEY = 'getfitnow-theme';

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [activeSection, setActiveSection] = useState<AppSection>('calendar');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signOutNonce, setSignOutNonce] = useState(0);
  const [isCoach, setIsCoach] = useState(false);
  const [coachGateIntent, setCoachGateIntent] = useState(false);
  const [memberAuthReturnToCalendar, setMemberAuthReturnToCalendar] =
    useState(false);
  const [coachStatus, setCoachStatus] = useState<CoachAccessResolution>('none');
  const [coachRole, setCoachRole] = useState<CoachRole | null>(null);
  const [myAccessRequest, setMyAccessRequest] =
    useState<CoachAccessRequest | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const [events, setEvents] = useState<SportEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [customDisciplines, setCustomDisciplines] = useState<CustomDiscipline[]>(
    []
  );
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([]);

  // Connected member profile & personal registrations
  const [myMemberProfile, setMyMemberProfile] = useState<MemberProfile | null>(
    null
  );
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);

  const [coachAdmins, setCoachAdmins] = useState<CoachAdminUser[]>([]);
  const [coachRequests, setCoachRequests] = useState<CoachAccessRequest[]>([]);
  const [coachInvites, setCoachInvites] = useState<CoachAdminInvite[]>([]);
  const [coachNotifications, setCoachNotifications] = useState<
    CoachNotification[]
  >([]);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);

  const [memberNotifications, setMemberNotifications] = useState<
    MemberNotification[]
  >([]);
  const [memberNotificationsLoaded, setMemberNotificationsLoaded] =
    useState(false);
  const [memberNotificationsPanelOpen, setMemberNotificationsPanelOpen] =
    useState(false);

  const disciplineCatalog = useMemo(
    () => buildDisciplineCatalog(customDisciplines),
    [customDisciplines]
  );

  // Live clock updated every 15s so H-1 cutoff, 0-registrant cancellation, and end-of-duration cleanup trigger promptly
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoDeleteAttemptedRef = useRef<Set<string>>(new Set());
  const memberNotifAttemptedRef = useRef<Set<string>>(new Set());

  // Modals & Drawers
  const [selectedEventForBooking, setSelectedEventForBooking] =
    useState<SportEvent | null>(null);
  const [eventFormState, setEventFormState] = useState<{
    open: boolean;
    initialDate?: Date | null;
    editingEvent?: SportEvent | null;
    duplicatingEvent?: SportEvent | null;
  }>({ open: false });
  const [rosterEventId, setRosterEventId] = useState<string | null>(null);

  const hasMapsApiKey = Boolean(GOOGLE_MAPS_API_KEY);
  const isVerifiedUser = Boolean(user && user.email);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage access errors
    }
  }, [theme]);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setMapsQuotaExceeded(true);
    };
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  // Automatically delete cancelled events (manual or H-1 0-registrant) and complete ended events
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !isCoach || eventsLoading) return;
    events.forEach((ev) => {
      const evalInfo = evaluateEventBooking(ev, nowMs);
      if (ev.status === 'cancelled' || evalInfo.isAutoCancelledNoRegistrants) {
        if (!autoDeleteAttemptedRef.current.has(ev.id)) {
          autoDeleteAttemptedRef.current.add(ev.id);
          void autoDeleteCancelledEvent(ev.id).then((ok) => {
            if (!ok) {
              autoDeleteAttemptedRef.current.delete(ev.id);
            }
          });
        }
        return;
      }

      const endMs = ev.startAt.toMillis() + ev.durationMinutes * 60 * 1000;
      if (nowMs >= endMs) {
        if (!autoDeleteAttemptedRef.current.has(ev.id)) {
          autoDeleteAttemptedRef.current.add(ev.id);
          void completeEndedEventAndNotifyMembers(ev).then((ok) => {
            if (!ok) {
              autoDeleteAttemptedRef.current.delete(ev.id);
            }
          });
        }
      }
    });
  }, [authLoading, isVerifiedUser, isCoach, eventsLoading, events, nowMs]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser && nextUser.email) {
        const res = await resolveCoachSession(nextUser);
        setIsCoach(res.isCoach);
        setCoachStatus(res.status);
        setCoachRole(res.role);
        if (!res.isCoach) {
          void ensureMyMemberProfile(nextUser);
        }
      } else {
        setIsCoach(false);
        setCoachStatus('none');
        setCoachRole(null);
        setMyAccessRequest(null);
        setMyMemberProfile(null);
        setMyRegistrations([]);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Real-time listener on the signed-in user's own /admins/{uid} status & role
  useEffect(() => {
    if (authLoading || !user || !user.email) return;
    const unsub = subscribeMyAdminStatus(user.uid, user.email, (info) => {
      setCoachStatus(info.status);
      setIsCoach(info.status === 'active');
      setCoachRole(info.role);
    });
    return () => unsub();
  }, [authLoading, user]);

  // Real-time listener on the signed-in user's own /coachAccessRequests/{uid}
  useEffect(() => {
    if (authLoading || !user || !user.email || isCoach) {
      setMyAccessRequest(null);
      return;
    }
    const unsub = subscribeMyCoachAccessRequest(
      user.uid,
      setMyAccessRequest,
      () => setMyAccessRequest(null)
    );
    return () => unsub();
  }, [authLoading, user, isCoach]);

  // Real-time listener on signed-in member's own profile, registrations & validation reminders
  useEffect(() => {
    if (authLoading || !user || !user.email) {
      setMyMemberProfile(null);
      setMyRegistrations([]);
      setMemberNotifications([]);
      setMemberNotificationsLoaded(false);
      setMemberNotificationsPanelOpen(false);
      return;
    }
    const unsubProfile = subscribeMyMemberProfile(
      user.email,
      setMyMemberProfile,
      () => setMyMemberProfile(null)
    );
    const unsubRegs = subscribeMyRegistrations(
      user.email,
      setMyRegistrations,
      () => setMyRegistrations([])
    );

    if (isCoach) {
      setMemberNotifications([]);
      setMemberNotificationsLoaded(false);
      setMemberNotificationsPanelOpen(false);
      return () => {
        unsubProfile();
        unsubRegs();
      };
    }

    setMemberNotificationsLoaded(false);
    const unsubMemberNotifs = subscribeMyMemberNotifications(
      user.email,
      (list) => {
        setMemberNotifications(list);
        setMemberNotificationsLoaded(true);
      },
      () => {
        setMemberNotifications([]);
        setMemberNotificationsLoaded(true);
      }
    );

    return () => {
      unsubProfile();
      unsubRegs();
      unsubMemberNotifs();
    };
  }, [authLoading, user, isCoach]);

  // Ensure every ended confirmed & unvalidated session triggers a validation reminder notification for the member
  useEffect(() => {
    if (
      authLoading ||
      !isVerifiedUser ||
      isCoach ||
      eventsLoading ||
      !memberNotificationsLoaded
    ) {
      return;
    }

    const userEmailLower = (user?.email ?? '').trim().toLowerCase();
    const eventsById = new Map(events.map((ev) => [ev.id, ev]));
    const existingNotifIds = new Set(memberNotifications.map((n) => n.id));
    const currentRegIds = new Set(myRegistrations.map((r) => r.id));
    Array.from(memberNotifAttemptedRef.current).forEach((id) => {
      if (!currentRegIds.has(id)) {
        memberNotifAttemptedRef.current.delete(id);
      }
    });

    myRegistrations.forEach((reg) => {
      if (reg.email.trim().toLowerCase() !== userEmailLower) return;
      if (reg.status !== 'confirmed' || reg.attended) return;
      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (matchedEvent?.status === 'cancelled') return;

      const endMs = getRegistrationEndMs(reg, matchedEvent);
      if (
        nowMs >= endMs &&
        !existingNotifIds.has(reg.id) &&
        !memberNotifAttemptedRef.current.has(reg.id)
      ) {
        memberNotifAttemptedRef.current.add(reg.id);
        void ensureSessionValidationNotification(reg, endMs).then((ok) => {
          if (!ok) {
            memberNotifAttemptedRef.current.delete(reg.id);
          }
        });
      }
    });
  }, [
    authLoading,
    isVerifiedUser,
    isCoach,
    eventsLoading,
    memberNotificationsLoaded,
    events,
    myRegistrations,
    memberNotifications,
    nowMs,
  ]);

  // Events listener: public read for published/cancelled events, full read for coaches
  useEffect(() => {
    if (authLoading) {
      return;
    }
    setEventsLoading(true);
    const unsub = subscribeEvents(
      isCoach,
      (list) => {
        setEvents(list);
        setEventsLoading(false);
      },
      () => {
        setEventsLoading(false);
      }
    );
    return () => unsub();
  }, [authLoading, isCoach]);

  useEffect(() => {
    const unsub = subscribeDisciplines(setCustomDisciplines);
    return () => unsub();
  }, []);

  const myAdminProfile = useMemo(
    () => (user ? coachAdmins.find((a) => a.id === user.uid) ?? null : null),
    [coachAdmins, user]
  );

  const isPrimaryBootstrapped = Boolean(
    user?.email &&
      user.emailVerified &&
      user.email.trim().toLowerCase() === BOOTSTRAPPED_COACH_EMAIL.toLowerCase()
  );

  const isCoachAdmin =
    isCoach &&
    (isPrimaryBootstrapped ||
      coachRole === 'coach_admin' ||
      myAdminProfile?.role === 'coach_admin');

  useEffect(() => {
    if (authLoading || !isCoach || !user?.email) {
      setRegistrations([]);
      setMemberProfiles([]);
      setCoachAdmins([]);
      setCoachNotifications([]);
      setNotificationsPanelOpen(false);
      return;
    }
    const unsubRegs = subscribeRegistrations(setRegistrations);
    const unsubMembers = subscribeMembers(setMemberProfiles);
    const unsubAdmins = subscribeCoachAdmins(setCoachAdmins);
    const unsubNotifs = subscribeMyCoachNotifications(
      user.uid,
      setCoachNotifications
    );
    return () => {
      unsubRegs();
      unsubMembers();
      unsubAdmins();
      unsubNotifs();
    };
  }, [authLoading, isCoach, user]);

  useEffect(() => {
    if (authLoading || !isCoachAdmin || !user?.email) {
      setCoachRequests([]);
      setCoachInvites([]);
      return;
    }
    const unsubRequests = subscribeCoachAccessRequests(setCoachRequests);
    const unsubInvites = subscribeCoachInvites(setCoachInvites);
    return () => {
      unsubRequests();
      unsubInvites();
    };
  }, [authLoading, isCoachAdmin, user]);

  const activeEvents = useMemo(
    () =>
      events.filter(
        (ev) =>
          ev.status !== 'cancelled' &&
          !evaluateEventBooking(ev, nowMs).isAutoCancelledNoRegistrants &&
          nowMs < ev.startAt.toMillis() + ev.durationMinutes * 60 * 1000
      ),
    [events, nowMs]
  );

  const activeEventIds = useMemo(
    () => new Set(activeEvents.map((ev) => ev.id)),
    [activeEvents]
  );

  const pendingCoachRequestsCount = useMemo(() => {
    if (!isCoachAdmin) return 0;
    const accessPending = coachRequests.filter((r) => r.status === 'pending').length;
    const promotionPending = coachAdmins.filter(
      (a) => a.active && a.role === 'coach' && a.adminRequestStatus === 'pending'
    ).length;
    return accessPending + promotionPending;
  }, [isCoachAdmin, coachRequests, coachAdmins]);

  const unreadCoachNotificationsCount = useMemo(
    () => coachNotifications.filter((n) => !n.read).length,
    [coachNotifications]
  );

  const unreadMemberNotificationsCount = useMemo(
    () =>
      memberNotifications.filter((n) =>
        n.type === 'event_cancelled' ? !n.read : !n.validated
      ).length,
    [memberNotifications]
  );

  const endedUnvalidatedRegistrationsCount = useMemo(() => {
    if (isCoach || !user?.email) return 0;
    const userEmailLower = user.email.trim().toLowerCase();
    const eventsById = new Map(events.map((ev) => [ev.id, ev]));
    return myRegistrations.filter((reg) => {
      if (reg.email.trim().toLowerCase() !== userEmailLower) return false;
      if (reg.status !== 'confirmed' || reg.attended) return false;
      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (matchedEvent?.status === 'cancelled') return false;
      return getRegistrationEndMs(reg, matchedEvent) <= nowMs;
    }).length;
  }, [isCoach, user, events, myRegistrations, nowMs]);

  const handleAuthenticatedUser = async (
    signedInUser: User,
    target: 'member' | 'coach'
  ) => {
    setAuthError(null);
    if (!signedInUser.email) {
      return;
    }
    const res = await resolveCoachSession(signedInUser);
    setIsCoach(res.isCoach);
    setCoachStatus(res.status);
    setCoachRole(res.role);
    if (!res.isCoach) {
      void ensureMyMemberProfile(signedInUser, true);
    }
    if (res.isCoach) {
      setCoachGateIntent(false);
      setMemberAuthReturnToCalendar(false);
      if (
        target === 'coach' &&
        (activeSection === 'calendar' ||
          activeSection === 'sessions' ||
          activeSection === 'member-profile')
      ) {
        setActiveSection('manage');
      }
    } else if (target === 'member') {
      setCoachGateIntent(false);
      if (
        activeSection === 'manage' ||
        activeSection === 'members' ||
        activeSection === 'coaches' ||
        (memberAuthReturnToCalendar && activeSection === 'member-profile')
      ) {
        setActiveSection('calendar');
      }
      setMemberAuthReturnToCalendar(false);
    }
  };

  const handleMemberGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await handleAuthenticatedUser(cred.user, 'member');
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleCoachGoogleSignIn = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await handleAuthenticatedUser(cred.user, 'coach');
    } catch (err) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setIsCoach(false);
    setCoachGateIntent(false);
    setMemberAuthReturnToCalendar(false);
    setCoachStatus('none');
    setCoachRole(null);
    setMyAccessRequest(null);
    setMyMemberProfile(null);
    setMyRegistrations([]);
    setRegistrations([]);
    setMemberProfiles([]);
    setCoachAdmins([]);
    setCoachRequests([]);
    setCoachInvites([]);
    setCoachNotifications([]);
    setNotificationsPanelOpen(false);
    setMemberNotifications([]);
    setMemberNotificationsLoaded(false);
    setMemberNotificationsPanelOpen(false);
    setSelectedEventForBooking(null);
    setEventFormState({ open: false });
    setRosterEventId(null);
    setAuthError(null);
    autoDeleteAttemptedRef.current.clear();
    memberNotifAttemptedRef.current.clear();
    setSignOutNonce((prev) => prev + 1);
    setActiveSection('calendar');
  };

  const currentBookingEvent = useMemo(() => {
    if (!selectedEventForBooking) return null;
    return (
      events.find((e) => e.id === selectedEventForBooking.id) ??
      selectedEventForBooking
    );
  }, [events, selectedEventForBooking]);

  const isCurrentBookingEventActive = useMemo(() => {
    if (!currentBookingEvent) return false;
    return activeEventIds.has(currentBookingEvent.id);
  }, [currentBookingEvent, activeEventIds]);

  const existingMemberBookingRegistration = useMemo(() => {
    if (!currentBookingEvent || !isVerifiedUser || !user?.email) return null;
    const userEmailLower = user.email.trim().toLowerCase();
    return (
      myRegistrations.find(
        (r) =>
          r.eventId === currentBookingEvent.id &&
          r.status === 'confirmed' &&
          r.email.trim().toLowerCase() === userEmailLower
      ) ?? null
    );
  }, [currentBookingEvent, isVerifiedUser, user, myRegistrations]);

  const invitedGuestRegistrationsForBooking = useMemo(() => {
    if (!currentBookingEvent || !isVerifiedUser || !user?.email) return [];
    const userEmailLower = user.email.trim().toLowerCase();
    return myRegistrations.filter(
      (r) =>
        r.eventId === currentBookingEvent.id &&
        r.status === 'confirmed' &&
        Boolean(r.isGuest) &&
        (r.invitedByEmail ?? '').trim().toLowerCase() === userEmailLower
    );
  }, [currentBookingEvent, isVerifiedUser, user, myRegistrations]);

  const currentRosterEvent = useMemo(() => {
    if (!rosterEventId) return null;
    return activeEvents.find((e) => e.id === rosterEventId) ?? null;
  }, [activeEvents, rosterEventId]);

  const coachDisplayName =
    myAdminProfile?.displayName || user?.displayName || 'David Frosio';

  const memberDisplayName = myMemberProfile
    ? `${myMemberProfile.firstName} ${myMemberProfile.lastName}`.trim()
    : user?.displayName || user?.email || 'Mon profil';

  const isCoachRoute =
    activeSection === 'manage' ||
    activeSection === 'members' ||
    activeSection === 'coaches';

  useEffect(() => {
    if (
      !authLoading &&
      isVerifiedUser &&
      !isCoach &&
      !coachGateIntent &&
      isCoachRoute
    ) {
      setActiveSection('calendar');
    }
  }, [authLoading, isVerifiedUser, isCoach, coachGateIntent, isCoachRoute]);

  const appShell = (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-16 text-slate-900 transition-colors duration-150 dark:bg-slate-950 dark:text-slate-100 md:pb-0">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 dark:bg-amber-950/80 dark:border-amber-800 dark:text-amber-200 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800 dark:text-amber-100 dark:hover:text-white"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <TopBar
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }
        activeSection={activeSection}
        onNavigate={(section) => {
          if (
            isVerifiedUser &&
            !isCoach &&
            (section === 'manage' ||
              section === 'members' ||
              section === 'coaches')
          ) {
            return;
          }
          if (
            section === 'calendar' ||
            section === 'sessions' ||
            section === 'member-profile'
          ) {
            setCoachGateIntent(false);
          }
          setMemberAuthReturnToCalendar(false);
          setActiveSection(section);
        }}
        isSignedIn={isVerifiedUser}
        isCoach={isCoach}
        userDisplayName={memberDisplayName}
        userPhotoUrl={myMemberProfile?.photoUrl}
        pendingCoachRequestsCount={pendingCoachRequestsCount}
        unreadCoachNotificationsCount={unreadCoachNotificationsCount}
        unreadMemberNotificationsCount={unreadMemberNotificationsCount}
        memberTrackingBadgeCount={endedUnvalidatedRegistrationsCount}
        notificationsOpen={
          isCoach ? notificationsPanelOpen : memberNotificationsPanelOpen
        }
        onToggleNotifications={() => {
          if (isCoach) {
            setNotificationsPanelOpen((prev) => !prev);
          } else {
            setMemberNotificationsPanelOpen((prev) => !prev);
          }
        }}
        onMemberSignIn={() => {
          setCoachGateIntent(false);
          setMemberAuthReturnToCalendar(true);
          setActiveSection('member-profile');
          setAuthError(null);
          window.setTimeout(() => {
            document.getElementById('member-auth-email')?.focus();
          }, 50);
        }}
        onCoachLogin={() => {
          setCoachGateIntent(true);
          setMemberAuthReturnToCalendar(false);
          setActiveSection('manage');
          setAuthError(null);
          window.setTimeout(() => {
            document.getElementById('coach-auth-email')?.focus();
          }, 50);
        }}
        onCreateEvent={() => {
          if (!isCoach) return;
          setEventFormState({ open: true, initialDate: null, editingEvent: null });
        }}
      />

      <main className="flex-1">
        {!user && isCoachRoute ? (
          <CoachAuthGate
            key={`coach-gate-${signOutNonce}`}
            user={user}
            authLoading={authLoading}
            isCoach={isCoach}
            coachStatus={coachStatus}
            myAccessRequest={myAccessRequest}
            authError={authError}
            onSignIn={() => void handleCoachGoogleSignIn()}
            onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'coach')}
            onSignOut={() => void handleSignOut()}
            onBackToCalendar={() => {
              setAuthError(null);
              setCoachGateIntent(false);
              setActiveSection('calendar');
            }}
          />
        ) : !user && activeSection === 'member-profile' ? (
          <MemberAuthGate
            key={`member-gate-${signOutNonce}`}
            authLoading={authLoading}
            authError={authError}
            onGoogleSignIn={() => void handleMemberGoogleSignIn()}
            onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'member')}
            onCoachAccess={() => {
              setAuthError(null);
              setMemberAuthReturnToCalendar(false);
              setCoachGateIntent(true);
              setActiveSection('manage');
            }}
            onBackToCalendar={() => {
              setAuthError(null);
              setMemberAuthReturnToCalendar(false);
              setActiveSection('calendar');
            }}
          />
        ) : (
          <>
            {isVerifiedUser && isCoach && (
              <CoachNotificationsBar
                notifications={coachNotifications}
                events={activeEvents}
                panelOpen={notificationsPanelOpen}
                onClosePanel={() => setNotificationsPanelOpen(false)}
                onMarkRead={(id) => void markCoachNotificationRead(id)}
                onMarkAllRead={() =>
                  void markAllCoachNotificationsRead(coachNotifications)
                }
                onDelete={(id) => void deleteCoachNotification(id)}
                onOpenEventRoster={(eventId) => setRosterEventId(eventId)}
              />
            )}

            {isVerifiedUser && !isCoach && !coachGateIntent && (
              <MemberNotificationsBar
                notifications={memberNotifications}
                panelOpen={memberNotificationsPanelOpen}
                onClosePanel={() => setMemberNotificationsPanelOpen(false)}
                onValidateSession={async (registrationId) => {
                  const reg = myRegistrations.find(
                    (r) => r.id === registrationId
                  );
                  if (!reg) {
                    throw new Error(
                      'Inscription introuvable pour cette séance.'
                    );
                  }
                  await validateMemberSession(reg);
                }}
                onMarkRead={(id) => void markMemberNotificationRead(id)}
                onMarkAllRead={() =>
                  void markAllMemberNotificationsRead(memberNotifications)
                }
                onDelete={(id) => void deleteMemberNotification(id)}
                onOpenMyTracking={() => {
                  setMemberNotificationsPanelOpen(false);
                  setActiveSection('member-profile');
                }}
              />
            )}

            {(activeSection === 'calendar' || activeSection === 'sessions') && (
              <HeroSection
                events={activeEvents}
                nowMs={nowMs}
                isCoach={isCoach}
                coachPhotoUrl={myAdminProfile?.photoUrl}
                coachName={isCoach ? coachDisplayName : undefined}
                onExploreCalendar={() => {
                  setActiveSection('calendar');
                  window.setTimeout(() => {
                    document
                      .getElementById('calendrier-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                onOpenCoachSpace={() => {
                  if (isCoach) {
                    setActiveSection('members');
                  }
                }}
                onOpenMemberProfile={() => {
                  setMemberAuthReturnToCalendar(false);
                  setActiveSection('member-profile');
                }}
              />
            )}

            {activeSection === 'calendar' && (
              <CalendarView
                events={activeEvents}
                disciplines={disciplineCatalog}
                nowMs={nowMs}
                isCoach={isCoach}
                loading={eventsLoading}
                hasMapsApiKey={hasMapsApiKey}
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
                onCreateEventForDate={(date) => {
                  if (!isCoach) return;
                  setEventFormState({
                    open: true,
                    initialDate: date,
                    editingEvent: null,
                    duplicatingEvent: null,
                  });
                }}
              />
            )}

            {activeSection === 'sessions' && (
              <SessionsListView
                events={activeEvents}
                disciplines={disciplineCatalog}
                nowMs={nowMs}
                isCoach={isCoach}
                loading={eventsLoading}
                hasMapsApiKey={hasMapsApiKey}
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
              />
            )}

            {activeSection === 'member-profile' && user && (
              <MemberPortalView
                user={user}
                memberProfile={myMemberProfile}
                registrations={isCoach ? registrations : myRegistrations}
                events={activeEvents}
                disciplines={disciplineCatalog}
                nowMs={nowMs}
                onValidateSession={
                  isCoach ? undefined : (reg) => validateMemberSession(reg)
                }
                onCancelRegistration={
                  isVerifiedUser ? (reg) => cancelMyRegistration(reg) : undefined
                }
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
                onExploreCalendar={() => setActiveSection('calendar')}
                onSignOut={() => void handleSignOut()}
              />
            )}

            {activeSection === 'manage' &&
              user &&
              (isCoach ? (
                <CoachEventsView
                  coachUid={user.uid}
                  coachEmail={user.email || ''}
                  coachName={coachDisplayName}
                  events={activeEvents}
                  registrations={registrations}
                  disciplines={disciplineCatalog}
                  nowMs={nowMs}
                  isCoachAdmin={isCoachAdmin}
                  pendingCoachRequestsCount={pendingCoachRequestsCount}
                  onOpenCoachesAdmin={() => setActiveSection('coaches')}
                  onSignOut={() => void handleSignOut()}
                  onCreateEvent={() =>
                    setEventFormState({
                      open: true,
                      initialDate: null,
                      editingEvent: null,
                      duplicatingEvent: null,
                    })
                  }
                  onEditEvent={(ev) =>
                    setEventFormState({
                      open: true,
                      initialDate: null,
                      editingEvent: ev,
                      duplicatingEvent: null,
                    })
                  }
                  onDuplicateEvent={(ev) =>
                    setEventFormState({
                      open: true,
                      initialDate: null,
                      editingEvent: null,
                      duplicatingEvent: ev,
                    })
                  }
                  onOpenRoster={(ev) => setRosterEventId(ev.id)}
                />
              ) : coachGateIntent ? (
                <CoachAuthGate
                  key={`coach-gate-${signOutNonce}`}
                  user={user}
                  authLoading={authLoading}
                  isCoach={isCoach}
                  coachStatus={coachStatus}
                  myAccessRequest={myAccessRequest}
                  authError={authError}
                  onSignIn={() => void handleCoachGoogleSignIn()}
                  onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'coach')}
                  onSignOut={() => void handleSignOut()}
                  onBackToCalendar={() => {
                    setCoachGateIntent(false);
                    setActiveSection('calendar');
                  }}
                />
              ) : null)}

            {activeSection === 'members' &&
              user &&
              (isCoach ? (
                <MembersTrackingView
                  coachEmail={user.email || ''}
                  events={activeEvents}
                  registrations={registrations}
                  memberProfiles={memberProfiles}
                  nowMs={nowMs}
                  onSignOut={() => void handleSignOut()}
                />
              ) : coachGateIntent ? (
                <CoachAuthGate
                  key={`coach-gate-${signOutNonce}`}
                  user={user}
                  authLoading={authLoading}
                  isCoach={isCoach}
                  coachStatus={coachStatus}
                  myAccessRequest={myAccessRequest}
                  authError={authError}
                  onSignIn={() => void handleCoachGoogleSignIn()}
                  onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'coach')}
                  onSignOut={() => void handleSignOut()}
                  onBackToCalendar={() => {
                    setCoachGateIntent(false);
                    setActiveSection('calendar');
                  }}
                />
              ) : null)}

            {activeSection === 'coaches' &&
              user &&
              (isCoach ? (
                <CoachesAdminView
                  currentAdminUser={user}
                  isCoachAdmin={isCoachAdmin}
                  admins={coachAdmins}
                  requests={coachRequests}
                  invites={coachInvites}
                  onSignOut={() => void handleSignOut()}
                />
              ) : coachGateIntent ? (
                <CoachAuthGate
                  key={`coach-gate-${signOutNonce}`}
                  user={user}
                  authLoading={authLoading}
                  isCoach={isCoach}
                  coachStatus={coachStatus}
                  myAccessRequest={myAccessRequest}
                  authError={authError}
                  onSignIn={() => void handleCoachGoogleSignIn()}
                  onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'coach')}
                  onSignOut={() => void handleSignOut()}
                  onBackToCalendar={() => {
                    setCoachGateIntent(false);
                    setActiveSection('calendar');
                  }}
                />
              ) : null)}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} GetFitNow Event · Réservations sportives en ligne</p>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveSection('calendar')}
              className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              Calendrier
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('sessions')}
              className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
            >
              Séances
            </button>
            {!isCoach && (
              <button
                type="button"
                onClick={() => {
                  setMemberAuthReturnToCalendar(false);
                  setActiveSection('member-profile');
                }}
                className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Mon suivi
              </button>
            )}
            {isCoach ? (
              <button
                type="button"
                onClick={() => setActiveSection('manage')}
                className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Espace coach
              </button>
            ) : !isVerifiedUser ? (
              <button
                type="button"
                onClick={() => {
                  setCoachGateIntent(true);
                  setMemberAuthReturnToCalendar(false);
                  setActiveSection('manage');
                }}
                className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Espace coach
              </button>
            ) : null}
          </div>
        </div>
      </footer>

      {/* Booking / Detail Modal (public detail view; auth requested when registering) */}
      {currentBookingEvent && (
        <BookingModal
          key={`${currentBookingEvent.id}-${user?.uid ?? 'guest'}`}
          event={currentBookingEvent}
          disciplines={disciplineCatalog}
          nowMs={nowMs}
          isSignedIn={isVerifiedUser}
          isCoach={isCoach}
          hasMapsApiKey={hasMapsApiKey}
          memberProfile={myMemberProfile}
          userEmail={user?.email}
          userDisplayName={user?.displayName}
          authError={authError}
          existingRegistration={existingMemberBookingRegistration}
          invitedGuestRegistrations={invitedGuestRegistrationsForBooking}
          isEventActive={isCurrentBookingEventActive}
          onCancelRegistration={
            isVerifiedUser ? (reg) => cancelMyRegistration(reg) : undefined
          }
          onMemberGoogleSignIn={() => void handleMemberGoogleSignIn()}
          onMemberEmailAuthSuccess={(u) =>
            void handleAuthenticatedUser(u, 'member')
          }
          onClose={() => setSelectedEventForBooking(null)}
          onOpenCoachRoster={(ev) => {
            setSelectedEventForBooking(null);
            setRosterEventId(ev.id);
          }}
          onOpenMemberTracking={() => {
            setSelectedEventForBooking(null);
            setActiveSection('member-profile');
          }}
          onDuplicateEvent={(ev) => {
            setSelectedEventForBooking(null);
            setEventFormState({
              open: true,
              initialDate: null,
              editingEvent: null,
              duplicatingEvent: ev,
            });
          }}
        />
      )}

      {/* Coach Create / Edit / Duplicate Event Modal (strictly Coach-only) */}
      {eventFormState.open && isCoach && isVerifiedUser && user && (
        <EventFormModal
          coachUid={user.uid}
          defaultCoachName={coachDisplayName}
          coachAdmins={coachAdmins}
          disciplines={disciplineCatalog}
          hasMapsApiKey={hasMapsApiKey}
          initialDate={eventFormState.initialDate}
          editingEvent={eventFormState.editingEvent}
          duplicatingEvent={eventFormState.duplicatingEvent}
          onClose={() => setEventFormState({ open: false })}
        />
      )}

      {/* Coach Roster & Attendance Drawer */}
      {currentRosterEvent && isCoach && isVerifiedUser && (
        <EventRosterDrawer
          event={currentRosterEvent}
          registrations={registrations}
          memberProfiles={memberProfiles}
          onClose={() => setRosterEventId(null)}
        />
      )}
    </div>
  );

  if (hasMapsApiKey) {
    return (
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        language="fr"
        region="FR"
        libraries={MAPS_LIBRARIES}
      >
        {appShell}
      </APIProvider>
    );
  }

  return appShell;
}
