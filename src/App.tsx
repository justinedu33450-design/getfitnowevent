import { useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { collection, getDocsFromServer, query, where } from 'firebase/firestore';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AlertTriangle, BookOpen, Calendar, Heart, Sparkles, X } from 'lucide-react';
import { auth, BOOTSTRAPPED_COACH_EMAIL, db } from './firebase';
import {
  cancelMyRegistration,
  deleteCoachNotification,
  deleteEndedEventAfterRetention,
  deleteMemberNotification,
  ensureMyMemberProfile,
  ensureSessionValidationNotification,
  markAllCoachNotificationsRead,
  markAllMemberNotificationsRead,
  markCoachNotificationRead,
  markMemberNotificationRead,
  notifyMembersOfEndedEvent,
  resolveCoachSession,
  subscribeAllMemberSchedules,
  subscribeAllTrainingPrograms,
  subscribeCoachAccessRequests,
  subscribeCoachAdmins,
  subscribeCoachConversations,
  subscribeCoachDirectory,
  subscribeCoachInvites,
  subscribeDisciplines,
  subscribeEvents,
  subscribeExercises,
  subscribeMemberConversations,
  subscribeMembers,
  subscribeMyAdminStatus,
  subscribeMyCoachAccessRequest,
  subscribeMyCoachNotifications,
  subscribeMyEventLikes,
  subscribeMyMemberNotifications,
  subscribeMyMemberProfile,
  subscribeMyMemberSchedule,
  subscribeMyRegistrations,
  subscribeMyTrainingPrograms,
  subscribePublishedEventReviews,
  subscribeRegistrations,
  syncCoachDirectoryFromAdmins,
  toggleEventLike,
  validateMemberSession,
} from './services/firestoreService';
import {
  AppSection,
  CoachAccessRequest,
  CoachAccessResolution,
  CoachAdminInvite,
  CoachAdminUser,
  CoachDirectoryEntry,
  CoachNotification,
  CoachRole,
  Conversation,
  CustomDiscipline,
  EventRatingSummary,
  EventReview,
  ExerciseLibraryItem,
  MemberAggregate,
  MemberNotification,
  MemberProfile,
  MemberScheduleSession,
  PendingMessageTarget,
  Registration,
  SportEvent,
  TrainingProgram,
  VALIDATION_LIMITS,
} from './types';
import { buildDisciplineCatalog } from './utils/disciplineColors';
import {
  evaluateEventBooking,
  getRegistrationEndMs,
} from './utils/dateAndValidation';
import {
  computeMemberBadges,
  getNewlyUnlockedBadges,
  MemberBadgeItem,
} from './utils/memberBadges';
import { TopBar } from './components/TopBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { CoachNotificationsBar } from './components/CoachNotificationsBar';
import { MemberNotificationsBar } from './components/MemberNotificationsBar';
import { HeroSection } from './components/HeroSection';
import { CalendarView } from './components/CalendarView';
import { SessionsListView } from './components/SessionsListView';
import { BookingModal } from './components/BookingModal';
import { EventFormModal } from './components/EventFormModal';
import { EventRosterDrawer } from './components/EventRosterDrawer';
import { CoachEventsView } from './components/CoachEventsView';
import { ExerciseLibraryView } from './components/ExerciseLibraryView';
import { ProgramMemberCandidate } from './components/ProgramBuilderModal';
import { MembersTrackingView } from './components/MembersTrackingView';
import { CoachesAdminView } from './components/CoachesAdminView';
import { CoachAuthGate } from './components/CoachAuthGate';
import { MemberAuthGate } from './components/MemberAuthGate';
import { MemberPortalView } from './components/MemberPortalView';
import { MessagesView } from './components/MessagesView';
import { EmailPasswordAuthForm } from './components/EmailPasswordAuthForm';
import { EventShareModal } from './components/EventShareModal';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MAPS_LIBRARIES = ['places', 'marker'];
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

  const [coachDirectory, setCoachDirectory] = useState<CoachDirectoryEntry[]>(
    []
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memberSchedules, setMemberSchedules] = useState<
    MemberScheduleSession[]
  >([]);
  const [trainingPrograms, setTrainingPrograms] = useState<TrainingProgram[]>(
    []
  );
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([]);
  const [manageTab, setManageTab] = useState<'events' | 'exercises'>('events');
  const [pendingMessageTarget, setPendingMessageTarget] =
    useState<PendingMessageTarget | null>(null);
  const [pendingMemberTrackingKey, setPendingMemberTrackingKey] = useState<
    string | null
  >(null);

  const disciplineCatalog = useMemo(
    () => buildDisciplineCatalog(customDisciplines),
    [customDisciplines]
  );

  // Live clock updated every 15s so booking cutoffs and end-of-duration cleanup trigger promptly
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoDeleteAttemptedRef = useRef<Set<string>>(new Set());
  const endedNotifyAttemptedRef = useRef<Set<string>>(new Set());
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
  const [rosterInitialTab, setRosterInitialTab] = useState<'roster' | 'reviews'>(
    'roster'
  );
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(
    () => new Set()
  );
  const [likingEventId, setLikingEventId] = useState<string | null>(null);
  const [pendingLikeEvent, setPendingLikeEvent] = useState<SportEvent | null>(
    null
  );
  const [likeError, setLikeError] = useState<string | null>(null);
  const [publishedReviews, setPublishedReviews] = useState<EventReview[]>([]);
  const [pendingReviewRegId, setPendingReviewRegId] = useState<string | null>(
    null
  );
  const [badgeToast, setBadgeToast] = useState<{
    badges: MemberBadgeItem[];
  } | null>(null);
  const [portalBadgesExpandNonce, setPortalBadgesExpandNonce] = useState(0);
  const [portalHighlightedBadgeIds, setPortalHighlightedBadgeIds] = useState<
    string[]
  >([]);
  const [sharingEvent, setSharingEvent] = useState<SportEvent | null>(null);
  const initialDeepLinkEventIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('event')
      : null
  );

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

  // Notify members on ended events, and delete ALL events (published or cancelled)
  // automatically 30 days after their end time
  useEffect(() => {
    if (authLoading || !isVerifiedUser || eventsLoading || !isCoach) return;
    events.forEach((ev) => {
      const endMs = ev.startAt.toMillis() + ev.durationMinutes * 60 * 1000;
      const deleteAfterMs = endMs + VALIDATION_LIMITS.ENDED_EVENT_RETENTION_MS;

      if (nowMs >= deleteAfterMs) {
        if (!autoDeleteAttemptedRef.current.has(ev.id)) {
          autoDeleteAttemptedRef.current.add(ev.id);
          void deleteEndedEventAfterRetention(ev).then((ok) => {
            if (!ok) {
              autoDeleteAttemptedRef.current.delete(ev.id);
            }
          });
        }
        return;
      } else {
        autoDeleteAttemptedRef.current.delete(ev.id);
      }

      if (ev.status === 'published' && nowMs >= endMs) {
        if (!endedNotifyAttemptedRef.current.has(ev.id)) {
          endedNotifyAttemptedRef.current.add(ev.id);
          void notifyMembersOfEndedEvent(ev).then((ok) => {
            if (!ok) {
              endedNotifyAttemptedRef.current.delete(ev.id);
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
          void ensureMyMemberProfile(nextUser, true);
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

  // Real-time listener on signed-in user's registrations (all users) & member-only profile/reminders (non-coaches)
  useEffect(() => {
    if (authLoading || !user || !user.email) {
      setMyMemberProfile(null);
      setMyRegistrations([]);
      setMemberNotifications([]);
      setMemberNotificationsLoaded(false);
      setMemberNotificationsPanelOpen(false);
      return;
    }

    const unsubRegs = subscribeMyRegistrations(
      user.email,
      setMyRegistrations,
      () => setMyRegistrations([])
    );

    if (isCoach) {
      setMyMemberProfile(null);
      setMemberNotifications([]);
      setMemberNotificationsLoaded(false);
      setMemberNotificationsPanelOpen(false);
      return () => {
        unsubRegs();
      };
    }

    const unsubProfile = subscribeMyMemberProfile(
      user.email,
      setMyMemberProfile,
      () => setMyMemberProfile(null)
    );

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

  // Open event detail modal automatically when arriving via shared ?event=<id> link
  useEffect(() => {
    if (authLoading || eventsLoading || !initialDeepLinkEventIdRef.current) {
      return;
    }
    const targetId = initialDeepLinkEventIdRef.current;
    initialDeepLinkEventIdRef.current = null;
    const matched = events.find((e) => e.id === targetId);
    if (matched) {
      setSelectedEventForBooking(matched);
    }
  }, [authLoading, eventsLoading, events]);

  useEffect(() => {
    const unsub = subscribeDisciplines(setCustomDisciplines);
    return () => unsub();
  }, []);

  // Signed-in user's liked events (/eventLikes)
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !user?.uid) {
      setLikedEventIds(new Set());
      return;
    }
    const unsub = subscribeMyEventLikes(
      user.uid,
      setLikedEventIds,
      () => setLikedEventIds(new Set())
    );
    return () => unsub();
  }, [authLoading, isVerifiedUser, user?.uid]);

  // Published event reviews & comments (/eventReviews, public read)
  useEffect(() => {
    if (authLoading) {
      return;
    }
    const unsub = subscribePublishedEventReviews(
      setPublishedReviews,
      () => setPublishedReviews([])
    );
    return () => unsub();
  }, [authLoading]);

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

  // Public active coach directory for authenticated member/coach messaging
  useEffect(() => {
    if (authLoading || !isVerifiedUser) {
      setCoachDirectory([]);
      return;
    }
    const unsub = subscribeCoachDirectory(setCoachDirectory, () =>
      setCoachDirectory([])
    );
    return () => unsub();
  }, [authLoading, isVerifiedUser]);

  // Keep /coachDirectory synced with /admins when coaches sign in
  useEffect(() => {
    if (authLoading || !isCoach || !user?.uid || coachAdmins.length === 0) {
      return;
    }
    void syncCoachDirectoryFromAdmins({
      admins: coachAdmins,
      existingDirectory: coachDirectory,
      isCoachAdmin,
      currentUid: user.uid,
    });
  }, [authLoading, isCoach, isCoachAdmin, user?.uid, coachAdmins, coachDirectory]);

  // Real-time 1-to-1 conversations for the signed-in user (Coach or Member)
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !user?.uid || !user.email) {
      setConversations([]);
      return;
    }
    const unsub = isCoach
      ? subscribeCoachConversations(user.uid, setConversations, () =>
          setConversations([])
        )
      : subscribeMemberConversations(user.email, setConversations, () =>
          setConversations([])
        );
    return () => unsub();
  }, [authLoading, isVerifiedUser, isCoach, user?.uid, user?.email]);

  // Real-time personalized weekly schedule sessions (coach sees all, member sees own)
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !user?.email) {
      setMemberSchedules([]);
      return;
    }
    const unsub = isCoach
      ? subscribeAllMemberSchedules(setMemberSchedules, () =>
          setMemberSchedules([])
        )
      : subscribeMyMemberSchedule(user.email, setMemberSchedules, () =>
          setMemberSchedules([])
        );
    return () => unsub();
  }, [authLoading, isVerifiedUser, isCoach, user?.email]);

  // Real-time 12-week running programs (coach sees all, member sees own)
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !user?.email) {
      setTrainingPrograms([]);
      return;
    }
    const unsub = isCoach
      ? subscribeAllTrainingPrograms(setTrainingPrograms, () =>
          setTrainingPrograms([])
        )
      : subscribeMyTrainingPrograms(user.email, setTrainingPrograms, () =>
          setTrainingPrograms([])
        );
    return () => unsub();
  }, [authLoading, isVerifiedUser, isCoach, user?.email]);

  // Real-time coach exercise library (renforcement, running, mobilité)
  useEffect(() => {
    if (authLoading || !isVerifiedUser || !isCoach) {
      setExercises([]);
      return;
    }
    const unsub = subscribeExercises(setExercises, () => setExercises([]));
    return () => unsub();
  }, [authLoading, isVerifiedUser, isCoach]);

  const activeEvents = useMemo(
    () =>
      events.filter((ev) => {
        const endMs = ev.startAt.toMillis() + ev.durationMinutes * 60 * 1000;
        return nowMs < endMs + VALIDATION_LIMITS.ENDED_EVENT_RETENTION_MS;
      }),
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

  const unreadMessagesCount = useMemo(
    () =>
      conversations.reduce(
        (sum, conv) =>
          sum + (isCoach ? conv.coachUnreadCount : conv.memberUnreadCount),
        0
      ),
    [conversations, isCoach]
  );

  const unreadMessagesByMemberKey = useMemo(() => {
    const map = new Map<string, number>();
    if (!isCoach) return map;
    conversations.forEach((conv) => {
      if (conv.coachUnreadCount > 0 && conv.memberEmailKey) {
        map.set(
          conv.memberEmailKey,
          (map.get(conv.memberEmailKey) ?? 0) + conv.coachUnreadCount
        );
      }
    });
    return map;
  }, [conversations, isCoach]);

  const coachDirectoryByUid = useMemo(
    () => new Map(coachDirectory.map((entry) => [entry.uid, entry])),
    [coachDirectory]
  );

  const endedUnvalidatedRegistrationsCount = useMemo(() => {
    if (!user?.email || isCoach) return 0;
    const userEmailLower = user.email.trim().toLowerCase();
    const eventsById = new Map(events.map((ev) => [ev.id, ev]));
    return myRegistrations.filter((reg) => {
      if (reg.email.trim().toLowerCase() !== userEmailLower) return false;
      if (reg.status !== 'confirmed' || reg.attended) return false;
      const matchedEvent = eventsById.get(reg.eventId) ?? null;
      if (matchedEvent?.status === 'cancelled') return false;
      return getRegistrationEndMs(reg, matchedEvent) <= nowMs;
    }).length;
  }, [user, isCoach, events, myRegistrations, nowMs]);

  const registeredEventIds = useMemo(() => {
    const ids = new Set<string>();
    if (!user?.email) return ids;
    const userEmailLower = user.email.trim().toLowerCase();
    myRegistrations.forEach((reg) => {
      if (
        reg.status === 'confirmed' &&
        !reg.isGuest &&
        reg.email.trim().toLowerCase() === userEmailLower
      ) {
        ids.add(reg.eventId);
      }
    });
    return ids;
  }, [user, myRegistrations]);

  const visibleReviews = useMemo(() => {
    const eventsById = new Map(events.map((ev) => [ev.id, ev]));
    return publishedReviews.filter((rev) => {
      const matchedEvent = eventsById.get(rev.eventId);
      if (!matchedEvent) {
        return rev.eventStartAt.toMillis() <= nowMs;
      }
      if (matchedEvent.status === 'cancelled') return false;
      const endMs =
        matchedEvent.startAt.toMillis() +
        matchedEvent.durationMinutes * 60 * 1000;
      return nowMs >= endMs;
    });
  }, [publishedReviews, events, nowMs]);

  const reviewsByEventId = useMemo(() => {
    const map = new Map<string, EventReview[]>();
    visibleReviews.forEach((rev) => {
      const list = map.get(rev.eventId) ?? [];
      list.push(rev);
      map.set(rev.eventId, list);
    });
    return map;
  }, [visibleReviews]);

  const ratingSummaryByEventId = useMemo(() => {
    const map = new Map<string, EventRatingSummary>();
    reviewsByEventId.forEach((list, eventId) => {
      if (list.length === 0) return;
      const sum = list.reduce((acc, r) => acc + r.rating, 0);
      map.set(eventId, {
        count: list.length,
        averageRating: sum / list.length,
      });
    });
    return map;
  }, [reviewsByEventId]);

  const reviewsByRegId = useMemo(() => {
    const map = new Map<string, EventReview>();
    visibleReviews.forEach((rev) => {
      if (rev.registrationId) {
        map.set(rev.registrationId, rev);
      }
    });
    return map;
  }, [visibleReviews]);

  const reviewedRegIds = useMemo(
    () => new Set(reviewsByRegId.keys()),
    [reviewsByRegId]
  );

  const formatLikeErrorMessage = (err: unknown): string => {
    if (err instanceof Error) {
      const msg = err.message.trim();
      if (msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg) as { error?: string };
          if (parsed.error?.toLowerCase().includes('permission')) {
            return 'Autorisation refusée pour enregistrer votre j’aime. Réessayez dans un instant.';
          }
          if (parsed.error) return parsed.error;
        } catch {
          return msg;
        }
      }
      return msg || 'Impossible de mettre à jour votre j’aime.';
    }
    return 'Impossible de mettre à jour votre j’aime.';
  };

  const handleToggleLike = async (event: SportEvent) => {
    setLikeError(null);
    if (!isVerifiedUser || !user?.uid) {
      setPendingLikeEvent(event);
      return;
    }
    if (likingEventId === event.id) return;
    setLikingEventId(event.id);
    try {
      await toggleEventLike(event, user.uid);
    } catch (err) {
      console.error('Impossible de mettre à jour le j’aime :', err);
      setLikeError(formatLikeErrorMessage(err));
    } finally {
      setLikingEventId(null);
    }
  };

  const handleValidateSessionWithBadgeNotice = async (
    reg: Registration,
    showFloatingToast: boolean
  ) => {
    const beforeSummary = computeMemberBadges({
      registrations: myRegistrations,
      events: activeEvents,
      disciplines: disciplineCatalog,
      memberEmail: user?.email,
      reviewsByRegId,
      nowMs,
    });
    await validateMemberSession(reg);
    const afterRegs = myRegistrations.map((item) =>
      item.id === reg.id ? { ...item, attended: true } : item
    );
    const afterSummary = computeMemberBadges({
      registrations: afterRegs,
      events: activeEvents,
      disciplines: disciplineCatalog,
      memberEmail: user?.email,
      reviewsByRegId,
      nowMs,
    });
    const newlyUnlocked = getNewlyUnlockedBadges(beforeSummary, afterSummary);
    if (newlyUnlocked.length > 0 && showFloatingToast) {
      setBadgeToast({ badges: newlyUnlocked });
      setPortalHighlightedBadgeIds(newlyUnlocked.map((b) => b.id));
    }
  };

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
      } else if (activeSection === 'member-profile') {
        setActiveSection('calendar');
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
    setRosterInitialTab('roster');
    setLikedEventIds(new Set());
    setPendingLikeEvent(null);
    setPendingReviewRegId(null);
    setBadgeToast(null);
    setPortalBadgesExpandNonce(0);
    setPortalHighlightedBadgeIds([]);
    setCoachDirectory([]);
    setConversations([]);
    setMemberSchedules([]);
    setExercises([]);
    setManageTab('events');
    setPendingMessageTarget(null);
    setPendingMemberTrackingKey(null);
    setAuthError(null);
    autoDeleteAttemptedRef.current.clear();
    endedNotifyAttemptedRef.current.clear();
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

  const handleCloseBookingModal = () => {
    setSelectedEventForBooking(null);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('event')) {
        url.searchParams.delete('event');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore history access errors
    }
  };

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

  const eligibleReviewRegistrationForBooking = useMemo(() => {
    if (
      !currentBookingEvent ||
      !isVerifiedUser ||
      !user?.email ||
      currentBookingEvent.status === 'cancelled'
    ) {
      return null;
    }
    const userEmailLower = user.email.trim().toLowerCase();
    return (
      myRegistrations.find(
        (r) =>
          r.eventId === currentBookingEvent.id &&
          r.status === 'confirmed' &&
          r.attended === true &&
          r.email.trim().toLowerCase() === userEmailLower &&
          getRegistrationEndMs(r, currentBookingEvent) <= nowMs
      ) ?? null
    );
  }, [currentBookingEvent, isVerifiedUser, user, myRegistrations, nowMs]);

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

  const programMemberCandidates = useMemo<ProgramMemberCandidate[]>(() => {
    const coachEmails = new Set<string>([
      BOOTSTRAPPED_COACH_EMAIL.trim().toLowerCase(),
    ]);
    const coachEmailKeys = new Set<string>();
    if (isCoach && user?.email?.trim()) {
      coachEmails.add(user.email.trim().toLowerCase());
    }
    coachAdmins.forEach((a) => {
      if (a.email?.trim()) coachEmails.add(a.email.trim().toLowerCase());
      if (a.emailKey?.trim()) coachEmailKeys.add(a.emailKey.trim());
    });

    const byEmail = new Map<string, ProgramMemberCandidate>();
    memberProfiles.forEach((profile) => {
      const email = (profile.email || '').trim();
      const emailLower = email.toLowerCase();
      const emailKey = (profile.emailKey || profile.id || emailLower).trim();
      if (
        !email ||
        !emailLower ||
        coachEmails.has(emailLower) ||
        (emailKey && coachEmailKeys.has(emailKey))
      ) {
        return;
      }
      const fullName = `${profile.firstName} ${profile.lastName}`.trim() || email;
      byEmail.set(emailLower, {
        email,
        emailKey: emailKey || emailLower,
        name: fullName,
        goal: profile.goal || '',
        fitnessLevel: profile.fitnessLevel || '',
      });
    });
    registrations.forEach((reg) => {
      if (reg.status !== 'confirmed' || reg.isGuest) return;
      const email = (reg.email || '').trim();
      const emailLower = email.toLowerCase();
      const emailKey = (reg.emailKey || emailLower).trim();
      if (
        !email ||
        !emailLower ||
        byEmail.has(emailLower) ||
        coachEmails.has(emailLower) ||
        (emailKey && coachEmailKeys.has(emailKey))
      ) {
        return;
      }
      const fullName = `${reg.firstName} ${reg.lastName}`.trim() || email;
      byEmail.set(emailLower, {
        email,
        emailKey: emailKey || emailLower,
        name: fullName,
      });
    });
    return Array.from(byEmail.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'fr')
    );
  }, [memberProfiles, registrations, coachAdmins, isCoach, user?.email]);

  const memberDisplayName = myMemberProfile
    ? `${myMemberProfile.firstName} ${myMemberProfile.lastName}`.trim()
    : user?.displayName || user?.email || 'Mon profil';

  const isCoachRoute =
    activeSection === 'manage' ||
    activeSection === 'members' ||
    activeSection === 'coaches';

  useEffect(() => {
    if (!authLoading && isVerifiedUser) {
      if (!isCoach && !coachGateIntent && isCoachRoute) {
        setActiveSection('calendar');
      } else if (isCoach && activeSection === 'member-profile') {
        setActiveSection('calendar');
      }
    }
  }, [
    authLoading,
    isVerifiedUser,
    isCoach,
    coachGateIntent,
    isCoachRoute,
    activeSection,
  ]);

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
          if (isVerifiedUser && isCoach && section === 'member-profile') {
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
        userDisplayName={isCoach ? coachDisplayName : memberDisplayName}
        userPhotoUrl={
          isCoach ? myAdminProfile?.photoUrl : myMemberProfile?.photoUrl
        }
        pendingCoachRequestsCount={pendingCoachRequestsCount}
        unreadCoachNotificationsCount={unreadCoachNotificationsCount}
        unreadMemberNotificationsCount={unreadMemberNotificationsCount}
        unreadMessagesCount={unreadMessagesCount}
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
            onEmailAuthSuccess={(u) => void handleAuthenticatedUser(u, 'coach')}
            onSignOut={() => void handleSignOut()}
            onBackToCalendar={() => {
              setAuthError(null);
              setCoachGateIntent(false);
              setActiveSection('calendar');
            }}
          />
        ) : !user &&
          (activeSection === 'member-profile' || activeSection === 'messages') ? (
          <MemberAuthGate
            key={`member-gate-${signOutNonce}`}
            authLoading={authLoading}
            authError={authError}
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
                onOpenEventRoster={(eventId) => {
                  setRosterInitialTab('roster');
                  setRosterEventId(eventId);
                }}
              />
            )}

            {isVerifiedUser && !isCoach && !coachGateIntent && (
              <MemberNotificationsBar
                notifications={memberNotifications}
                reviewedRegIds={reviewedRegIds}
                nowMs={nowMs}
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
                  await handleValidateSessionWithBadgeNotice(
                    reg,
                    activeSection !== 'member-profile'
                  );
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
                onOpenReview={(registrationId) => {
                  setMemberNotificationsPanelOpen(false);
                  setPendingReviewRegId(registrationId);
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
                onOpenMemberProfile={
                  isCoach
                    ? undefined
                    : () => {
                        setMemberAuthReturnToCalendar(false);
                        setActiveSection('member-profile');
                      }
                }
              />
            )}

            {activeSection === 'calendar' && (
              <CalendarView
                events={activeEvents}
                disciplines={disciplineCatalog}
                nowMs={nowMs}
                isCoach={isCoach}
                isCoachAdmin={isCoachAdmin}
                registeredEventIds={registeredEventIds}
                likedEventIds={likedEventIds}
                likingEventId={likingEventId}
                onToggleLike={(ev) => void handleToggleLike(ev)}
                onShareEvent={(ev) => setSharingEvent(ev)}
                ratingSummaryByEventId={ratingSummaryByEventId}
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
                isCoachAdmin={isCoachAdmin}
                registeredEventIds={registeredEventIds}
                likedEventIds={likedEventIds}
                likingEventId={likingEventId}
                onToggleLike={(ev) => void handleToggleLike(ev)}
                onShareEvent={(ev) => setSharingEvent(ev)}
                ratingSummaryByEventId={ratingSummaryByEventId}
                loading={eventsLoading}
                hasMapsApiKey={hasMapsApiKey}
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
              />
            )}

            {activeSection === 'member-profile' && user && !isCoach && (
              <MemberPortalView
                user={user}
                memberProfile={myMemberProfile}
                registrations={myRegistrations}
                events={activeEvents}
                disciplines={disciplineCatalog}
                nowMs={nowMs}
                likedEventIds={likedEventIds}
                likingEventId={likingEventId}
                onToggleLike={(ev) => void handleToggleLike(ev)}
                onShareEvent={(ev) => setSharingEvent(ev)}
                reviewsByRegId={reviewsByRegId}
                ratingSummaryByEventId={ratingSummaryByEventId}
                initialReviewRegId={pendingReviewRegId}
                onClearInitialReviewRegId={() => setPendingReviewRegId(null)}
                initialBadgesExpandNonce={portalBadgesExpandNonce}
                initialHighlightedBadgeIds={portalHighlightedBadgeIds}
                onValidateSession={
                  isVerifiedUser ? (reg) => validateMemberSession(reg) : undefined
                }
                onCancelRegistration={
                  isVerifiedUser ? (reg) => cancelMyRegistration(reg) : undefined
                }
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
                onExploreCalendar={() => setActiveSection('calendar')}
                unreadMessagesCount={unreadMessagesCount}
                recentConversations={conversations}
                customScheduleSessions={memberSchedules}
                trainingPrograms={trainingPrograms}
                coachDirectory={coachDirectory}
                onRequestCoachProgram={(coach) => {
                  if (coach && user.email) {
                    setPendingMessageTarget({
                      coachUid: coach.uid,
                      coachName: coach.displayName,
                      coachPhotoUrl: coach.photoUrl,
                      memberEmail: user.email,
                      memberName: memberDisplayName,
                      memberPhotoUrl: myMemberProfile?.photoUrl,
                    });
                  }
                  setActiveSection('messages');
                }}
                onOpenMessages={(conv) => {
                  if (conv) {
                    setPendingMessageTarget({
                      coachUid: conv.coachUid,
                      coachName: conv.coachName,
                      coachPhotoUrl: conv.coachPhotoUrl,
                      memberEmail: conv.memberEmail,
                      memberEmailKey: conv.memberEmailKey,
                      memberName: conv.memberName,
                      memberPhotoUrl: conv.memberPhotoUrl,
                    });
                  }
                  setActiveSection('messages');
                }}
                onSignOut={() => void handleSignOut()}
              />
            )}

            {activeSection === 'messages' && user && isVerifiedUser && (
              <MessagesView
                user={user}
                isCoach={isCoach}
                currentUserDisplayName={
                  isCoach ? coachDisplayName : memberDisplayName
                }
                currentUserPhotoUrl={
                  isCoach ? myAdminProfile?.photoUrl : myMemberProfile?.photoUrl
                }
                conversations={conversations}
                coachDirectory={coachDirectory}
                memberProfiles={memberProfiles}
                registrations={registrations}
                coachAdmins={coachAdmins}
                events={activeEvents}
                initialTarget={pendingMessageTarget}
                onConsumeInitialTarget={() => setPendingMessageTarget(null)}
                onOpenMemberProfile={
                  isCoach
                    ? (memberEmailKey) => {
                        setPendingMemberTrackingKey(memberEmailKey);
                        setActiveSection('members');
                      }
                    : undefined
                }
                onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
              />
            )}

            {activeSection === 'manage' &&
              user &&
              (isCoach ? (
                <>
                  <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
                    <div
                      role="tablist"
                      aria-label="Sous-sections de gestion coach"
                      className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={manageTab === 'events'}
                        onClick={() => setManageTab('events')}
                        className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                          manageTab === 'events'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Événements &amp; Disciplines</span>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={manageTab === 'exercises'}
                        onClick={() => setManageTab('exercises')}
                        className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                          manageTab === 'exercises'
                            ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Bibliothèque d’exercices &amp; Programmes</span>
                      </button>
                    </div>
                  </div>

                  {manageTab === 'events' ? (
                    <CoachEventsView
                      coachUid={user.uid}
                      coachEmail={user.email || ''}
                      coachName={coachDisplayName}
                      events={activeEvents}
                      registrations={registrations}
                      disciplines={disciplineCatalog}
                      nowMs={nowMs}
                      ratingSummaryByEventId={ratingSummaryByEventId}
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
                      onOpenRoster={(ev, tab) => {
                        setRosterInitialTab(tab ?? 'roster');
                        setRosterEventId(ev.id);
                      }}
                      onShareEvent={(ev) => setSharingEvent(ev)}
                    />
                  ) : (
                    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                      <ExerciseLibraryView
                        coachUid={user.uid}
                        coachName={coachDisplayName}
                        coachDirectory={coachDirectory}
                        disciplines={disciplineCatalog}
                        exercises={exercises}
                        memberCandidates={programMemberCandidates}
                        trainingPrograms={trainingPrograms}
                        memberSchedules={memberSchedules}
                      />
                    </section>
                  )}
                </>
              ) : coachGateIntent ? (
                <CoachAuthGate
                  key={`coach-gate-${signOutNonce}`}
                  user={user}
                  authLoading={authLoading}
                  isCoach={isCoach}
                  coachStatus={coachStatus}
                  myAccessRequest={myAccessRequest}
                  authError={authError}
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
                  currentCoachUid={user.uid}
                  currentCoachName={coachDisplayName}
                  coachAdmins={coachAdmins}
                  coachDirectory={coachDirectory}
                  events={activeEvents}
                  registrations={registrations}
                  memberProfiles={memberProfiles}
                  memberSchedules={memberSchedules}
                  trainingPrograms={trainingPrograms}
                  disciplines={disciplineCatalog}
                  exercises={exercises}
                  nowMs={nowMs}
                  unreadMessagesByMemberKey={unreadMessagesByMemberKey}
                  initialSelectedMemberKey={pendingMemberTrackingKey}
                  onConsumeInitialSelectedMemberKey={() =>
                    setPendingMemberTrackingKey(null)
                  }
                  onMessageMember={(member: MemberAggregate) => {
                    if (!user?.uid || !member.email) return;
                    setPendingMessageTarget({
                      coachUid: user.uid,
                      coachName: coachDisplayName,
                      coachPhotoUrl: myAdminProfile?.photoUrl,
                      memberEmail: member.email,
                      memberEmailKey: member.emailKey,
                      memberName:
                        `${member.firstName} ${member.lastName}`.trim() ||
                        member.email,
                      memberPhotoUrl: member.profile?.photoUrl,
                    });
                    setActiveSection('messages');
                  }}
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
                  myRegistrations={myRegistrations}
                  events={activeEvents}
                  nowMs={nowMs}
                  onSelectEvent={(ev) => setSelectedEventForBooking(ev)}
                  onExploreCalendar={() => setActiveSection('calendar')}
                  onCancelRegistration={
                    isVerifiedUser ? (reg) => cancelMyRegistration(reg) : undefined
                  }
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
            {isVerifiedUser && (
              <button
                type="button"
                onClick={() => setActiveSection('messages')}
                className="hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              >
                Messagerie
              </button>
            )}
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
          isCoachAdmin={isCoachAdmin}
          hasMapsApiKey={hasMapsApiKey}
          memberProfile={isCoach ? null : myMemberProfile}
          userEmail={user?.email}
          userDisplayName={myAdminProfile?.displayName || user?.displayName}
          authError={authError}
          existingRegistration={existingMemberBookingRegistration}
          invitedGuestRegistrations={invitedGuestRegistrationsForBooking}
          isEventActive={isCurrentBookingEventActive}
          currentUserUid={user?.uid ?? null}
          likedEventIds={likedEventIds}
          likingEventId={likingEventId}
          onToggleLike={(ev) => void handleToggleLike(ev)}
          onShareEvent={(ev) => setSharingEvent(ev)}
          eventReviews={reviewsByEventId.get(currentBookingEvent.id) ?? []}
          ratingSummary={ratingSummaryByEventId.get(currentBookingEvent.id)}
          eligibleReviewRegistration={eligibleReviewRegistrationForBooking}
          onValidateSession={
            isVerifiedUser && !isCoach
              ? (reg) =>
                  handleValidateSessionWithBadgeNotice(
                    reg,
                    activeSection !== 'member-profile'
                  )
              : undefined
          }
          onCancelRegistration={
            isVerifiedUser ? (reg) => cancelMyRegistration(reg) : undefined
          }
          onMemberEmailAuthSuccess={(u) =>
            void handleAuthenticatedUser(u, 'member')
          }
          onClose={handleCloseBookingModal}
          onOpenCoachRoster={(ev) => {
            setSelectedEventForBooking(null);
            setRosterInitialTab('roster');
            setRosterEventId(ev.id);
          }}
          onOpenMemberTracking={
            isCoach
              ? undefined
              : () => {
                  setSelectedEventForBooking(null);
                  setActiveSection('member-profile');
                }
          }
          onOpenCoachRegistrations={
            isCoach
              ? () => {
                  setSelectedEventForBooking(null);
                  setActiveSection('coaches');
                }
              : undefined
          }
          onDuplicateEvent={(ev) => {
            setSelectedEventForBooking(null);
            setEventFormState({
              open: true,
              initialDate: null,
              editingEvent: null,
              duplicatingEvent: ev,
            });
          }}
          onMessageCoach={
            isVerifiedUser && !isCoach && user?.email
              ? (ev) => {
                  const targetCoachUid = ev.coachUids?.[0] || ev.createdBy;
                  if (!targetCoachUid) return;
                  const dirEntry = coachDirectoryByUid.get(targetCoachUid);
                  const fallbackCoachName =
                    dirEntry?.displayName ||
                    ev.coachNames?.[0] ||
                    ev.coachName?.split(',')[0]?.trim() ||
                    'Coach GetFitNow';
                  setPendingMessageTarget({
                    coachUid: targetCoachUid,
                    coachName: fallbackCoachName,
                    coachPhotoUrl: dirEntry?.photoUrl,
                    memberEmail: user.email || '',
                    memberName: memberDisplayName,
                    memberPhotoUrl: myMemberProfile?.photoUrl,
                    contextEventId: ev.id,
                    contextEventTitle: ev.title,
                  });
                  handleCloseBookingModal();
                  setActiveSection('messages');
                }
              : undefined
          }
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
      {currentRosterEvent && isCoach && isVerifiedUser && user && (
        <EventRosterDrawer
          event={currentRosterEvent}
          registrations={registrations}
          memberProfiles={memberProfiles}
          coachAdmins={coachAdmins}
          eventReviews={reviewsByEventId.get(currentRosterEvent.id) ?? []}
          ratingSummary={ratingSummaryByEventId.get(currentRosterEvent.id)}
          currentUserUid={user.uid}
          initialTab={rosterInitialTab}
          onMessageParticipant={(reg, ev) => {
            const matchedProfile = memberProfiles.find(
              (p) =>
                p.emailKey === reg.emailKey ||
                p.email.trim().toLowerCase() === reg.email.trim().toLowerCase()
            );
            setPendingMessageTarget({
              coachUid: user.uid,
              coachName: coachDisplayName,
              coachPhotoUrl: myAdminProfile?.photoUrl,
              memberEmail: reg.email,
              memberEmailKey: reg.emailKey,
              memberName:
                `${reg.firstName} ${reg.lastName}`.trim() || reg.email,
              memberPhotoUrl: matchedProfile?.photoUrl,
              contextEventId: ev.id,
              contextEventTitle: ev.title,
            });
            setRosterEventId(null);
            setRosterInitialTab('roster');
            setActiveSection('messages');
          }}
          onClose={() => {
            setRosterEventId(null);
            setRosterInitialTab('roster');
          }}
        />
      )}

      {/* Quick Member Auth Modal triggered by unauthenticated Like click */}
      {pendingLikeEvent && !isVerifiedUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-like-auth-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          onClick={() => setPendingLikeEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                  <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="quick-like-auth-title"
                    className="font-display text-base font-bold text-slate-900 dark:text-white"
                  >
                    Connectez-vous pour aimer cette séance
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    {pendingLikeEvent.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingLikeEvent(null)}
                aria-label="Fermer la fenêtre"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4">
              <EmailPasswordAuthForm
                audience="member"
                onSuccess={(signedInUser) => {
                  const targetEv = pendingLikeEvent;
                  setPendingLikeEvent(null);
                  void (async () => {
                    await handleAuthenticatedUser(signedInUser, 'member');
                    if (
                      targetEv &&
                      targetEv.status === 'published' &&
                      signedInUser.uid
                    ) {
                      try {
                        const existingLikesSnap = await getDocsFromServer(
                          query(
                            collection(db, 'eventLikes'),
                            where('userId', '==', signedInUser.uid)
                          )
                        );
                        const alreadyLiked = existingLikesSnap.docs.some(
                          (d) =>
                            d.id === `${targetEv.id}__${signedInUser.uid}` ||
                            d.data().eventId === targetEv.id
                        );
                        if (!alreadyLiked) {
                          await toggleEventLike(targetEv, signedInUser.uid);
                        }
                      } catch (err) {
                        console.error(
                          'Erreur lors du j’aime après connexion :',
                          err
                        );
                        setLikeError(formatLikeErrorMessage(err));
                      }
                    }
                  })();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Event Social Share Modal */}
      {sharingEvent && (
        <EventShareModal
          event={sharingEvent}
          disciplines={disciplineCatalog}
          onClose={() => setSharingEvent(null)}
        />
      )}

      {badgeToast && badgeToast.badges.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-4 z-50 flex max-w-sm items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950 shadow-lg dark:border-emerald-800 dark:bg-emerald-950/95 dark:text-emerald-100 md:bottom-5"
        >
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {badgeToast.badges.length === 1
                ? `Nouveau badge débloqué : ${badgeToast.badges[0].title}`
                : `${badgeToast.badges.length} nouveaux badges débloqués`}
            </p>
            <p className="mt-0.5 text-emerald-800 dark:text-emerald-200">
              {badgeToast.badges.map((b) => b.title).join(' · ')}
            </p>
            <button
              type="button"
              onClick={() => {
                setPortalHighlightedBadgeIds(
                  badgeToast.badges.map((b) => b.id)
                );
                setPortalBadgesExpandNonce((prev) => prev + 1);
                setBadgeToast(null);
                setActiveSection('member-profile');
                window.setTimeout(() => {
                  document
                    .getElementById('member-badges-section')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 100);
              }}
              className="mt-2 inline-flex min-h-[30px] items-center rounded-md bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
            >
              Voir mes badges
            </button>
          </div>
          <button
            type="button"
            onClick={() => setBadgeToast(null)}
            aria-label="Fermer la notification de badge"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/60 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {likeError && (
        <div
          role="alert"
          className="fixed bottom-20 right-4 z-50 flex max-w-sm items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 shadow-lg dark:border-rose-800 dark:bg-rose-950/95 dark:text-rose-100 md:bottom-5"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
            aria-hidden="true"
          />
          <span className="flex-1">{likeError}</span>
          <button
            type="button"
            onClick={() => setLikeError(null)}
            aria-label="Fermer le message d’erreur"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-rose-600 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/60 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <OfflineIndicator />
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
