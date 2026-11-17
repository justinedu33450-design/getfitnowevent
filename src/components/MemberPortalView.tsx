import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileText,
  LogOut,
  MapPin,
  Save,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  DisciplineItem,
  FitnessLevel,
  MemberProfile,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import { upsertMyMemberProfile } from '../services/firestoreService';
import {
  FITNESS_LEVEL_OPTIONS,
  calculateAgeFromBirthDate,
  downloadEventIcs,
  formatFrenchDateLong,
  formatFrenchDateShort,
  formatFrenchTime,
  formatPriceEuros,
  formatTimeRange,
  getRegistrationEndMs,
  getRegistrationPaymentBadgeInfo,
  toLocalDateInputValue,
} from '../utils/dateAndValidation';
import { getDisciplineStyle } from '../utils/disciplineColors';
import { downloadPaymentReceipt } from '../utils/paymentHelpers';
import { PhotoUploadField, ProfileAvatar } from './ProfileAvatar';
import { PasswordSettingsCard } from './PasswordSettingsCard';

interface MemberPortalViewProps {
  user: User;
  memberProfile: MemberProfile | null;
  registrations: Registration[];
  events: SportEvent[];
  disciplines: DisciplineItem[];
  nowMs: number;
  onValidateSession?: (registration: Registration) => Promise<void>;
  onCancelRegistration?: (registration: Registration) => Promise<void>;
  onSelectEvent: (event: SportEvent) => void;
  onExploreCalendar: () => void;
  onSignOut: () => void;
}

export function MemberPortalView({
  user,
  memberProfile,
  registrations,
  events,
  disciplines,
  nowMs,
  onValidateSession,
  onCancelRegistration,
  onSelectEvent,
  onExploreCalendar,
  onSignOut,
}: MemberPortalViewProps) {
  const defaultNames = useMemo(() => {
    const parts = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
    const emailLocal = (user.email || '').split('@')[0] || 'Adhérent';
    return {
      firstName: parts[0] || emailLocal,
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    };
  }, [user.displayName, user.email]);

  const [firstName, setFirstName] = useState(
    memberProfile?.firstName || defaultNames.firstName
  );
  const [lastName, setLastName] = useState(
    memberProfile?.lastName || defaultNames.lastName
  );
  const [phone, setPhone] = useState(memberProfile?.phone || '');
  const [birthDate, setBirthDate] = useState(memberProfile?.birthDate || '');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | ''>(
    memberProfile?.fitnessLevel || ''
  );
  const [goal, setGoal] = useState(memberProfile?.goal || '');
  const [photoUrl, setPhotoUrl] = useState(memberProfile?.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [trackingTab, setTrackingTab] = useState<'upcoming' | 'history' | 'cancelled'>(
    'upcoming'
  );
  const [validatingRegId, setValidatingRegId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmCancelRegId, setConfirmCancelRegId] = useState<string | null>(null);
  const [cancellingRegId, setCancellingRegId] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!memberProfile) return;
    setFirstName(memberProfile.firstName || defaultNames.firstName);
    setLastName(memberProfile.lastName || defaultNames.lastName);
    setPhone(memberProfile.phone || '');
    setBirthDate(memberProfile.birthDate || '');
    setFitnessLevel(memberProfile.fitnessLevel || '');
    setGoal(memberProfile.goal || '');
    setPhotoUrl(memberProfile.photoUrl || '');
  }, [
    memberProfile?.id,
    memberProfile?.firstName,
    memberProfile?.lastName,
    memberProfile?.phone,
    memberProfile?.birthDate,
    memberProfile?.fitnessLevel,
    memberProfile?.goal,
    memberProfile?.photoUrl,
    defaultNames.firstName,
    defaultNames.lastName,
  ]);

  const todayIso = useMemo(() => toLocalDateInputValue(new Date()), []);
  const computedAge = useMemo(
    () => calculateAgeFromBirthDate(birthDate),
    [birthDate]
  );

  const eventsById = useMemo(
    () => new Map(events.map((ev) => [ev.id, ev])),
    [events]
  );

  const confirmedRegistrations = useMemo(
    () => registrations.filter((r) => r.status === 'confirmed'),
    [registrations]
  );

  const cancelledRegistrations = useMemo(
    () =>
      registrations
        .filter((r) => r.status === 'cancelled')
        .slice()
        .sort((a, b) => {
          const aMs = a.updatedAt?.toMillis?.() ?? a.eventStartAt.toMillis();
          const bMs = b.updatedAt?.toMillis?.() ?? b.eventStartAt.toMillis();
          return bMs - aMs;
        }),
    [registrations]
  );

  const upcomingRegistrations = useMemo(
    () =>
      confirmedRegistrations
        .filter((r) => {
          const matchedEvent = eventsById.get(r.eventId) ?? null;
          return getRegistrationEndMs(r, matchedEvent) > nowMs;
        })
        .slice()
        .sort((a, b) => a.eventStartAt.toMillis() - b.eventStartAt.toMillis()),
    [confirmedRegistrations, eventsById, nowMs]
  );

  const pastRegistrations = useMemo(
    () =>
      confirmedRegistrations
        .filter((r) => {
          const matchedEvent = eventsById.get(r.eventId) ?? null;
          return getRegistrationEndMs(r, matchedEvent) <= nowMs;
        })
        .slice()
        .sort((a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis()),
    [confirmedRegistrations, eventsById, nowMs]
  );

  const userEmailLower = (user.email ?? '').trim().toLowerCase();

  const endedUnvalidatedRegistrations = useMemo(
    () =>
      pastRegistrations.filter((r) => {
        if (r.email.trim().toLowerCase() !== userEmailLower) return false;
        const matchedEvent = eventsById.get(r.eventId) ?? null;
        return !r.attended && matchedEvent?.status !== 'cancelled';
      }),
    [pastRegistrations, eventsById, userEmailLower]
  );

  const attendedCount = useMemo(
    () =>
      confirmedRegistrations.filter(
        (r) => r.attended && r.email.trim().toLowerCase() === userEmailLower
      ).length,
    [confirmedRegistrations, userEmailLower]
  );

  const fullName =
    `${firstName} ${lastName}`.trim() ||
    user.displayName ||
    user.email ||
    'Mon profil';

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      await upsertMyMemberProfile({
        user,
        firstName,
        lastName,
        phone,
        goal,
        birthDate,
        fitnessLevel,
        photoUrl,
        existingProfile: memberProfile,
      });
      setFeedback({
        type: 'success',
        text: 'Votre profil et votre photo ont été enregistrés.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’enregistrer votre profil.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleValidateSession = async (reg: Registration) => {
    if (!onValidateSession) return;
    setValidationError(null);
    setValidatingRegId(reg.id);
    try {
      await onValidateSession(reg);
    } catch (err) {
      let message = 'Impossible de valider cette séance pour le moment.';
      if (err instanceof Error) {
        if (err.message.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(err.message) as { error?: string };
            if (parsed.error?.toLowerCase().includes('permission')) {
              message =
                'La validation n’a pas encore été autorisée (vérifiez que la séance est bien terminée).';
            } else if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            message = err.message;
          }
        } else {
          message = err.message;
        }
      }
      setValidationError(message);
    } finally {
      setValidatingRegId(null);
    }
  };

  const handleConfirmCancelRegistration = async (reg: Registration) => {
    if (!onCancelRegistration) return;
    setCancelFeedback(null);
    setCancellingRegId(reg.id);
    try {
      await onCancelRegistration(reg);
      setConfirmCancelRegId(null);
      const isPaid =
        reg.paymentStatus === 'paid' && (reg.amountCents ?? 0) > 0;
      const isHostedGuest =
        Boolean(reg.isGuest) &&
        (reg.invitedByEmail ?? '').trim().toLowerCase() === userEmailLower;
      const targetLabel = isHostedGuest
        ? `L’inscription de ${reg.firstName} ${reg.lastName} à « ${reg.eventTitle} »`
        : `Votre inscription à « ${reg.eventTitle} »`;
      setCancelFeedback({
        type: 'success',
        text: isPaid
          ? `${targetLabel} a été annulée. Le remboursement de ${formatPriceEuros(reg.amountCents ?? 0)} a été enregistré.`
          : `${targetLabel} a bien été annulée. La place a été libérée.`,
      });
    } catch (err) {
      let message = 'Impossible d’annuler cette inscription pour le moment.';
      if (err instanceof Error) {
        if (err.message.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(err.message) as { error?: string };
            if (parsed.error?.toLowerCase().includes('permission')) {
              message =
                nowMs >= reg.eventStartAt.toMillis()
                  ? 'L’annulation n’est plus autorisée car la séance a déjà commencé.'
                  : 'Autorisation refusée lors de l’annulation. Vérifiez que vous êtes bien connecté avec le compte utilisé pour l’inscription.';
            } else if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            message = err.message;
          }
        } else {
          message = err.message;
        }
      }
      setCancelFeedback({ type: 'error', text: message });
    } finally {
      setCancellingRegId(null);
    }
  };

  const displayedRegistrations =
    trackingTab === 'upcoming'
      ? upcomingRegistrations
      : trackingTab === 'history'
        ? pastRegistrations
        : cancelledRegistrations;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5 min-w-0">
          <ProfileAvatar name={fullName} photoUrl={photoUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl truncate">
              {fullName}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 truncate">
              {user.email} · Mon profil adhérent & suivi des événements
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={onExploreCalendar}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 whitespace-nowrap cursor-pointer"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Voir le calendrier
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* 4-Column Personal KPI Strip */}
      <div className="mt-6 grid grid-cols-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Inscriptions totales
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {confirmedRegistrations.length}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Séances à venir</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {upcomingRegistrations.length}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Séances passées</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {pastRegistrations.length}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Présences validées
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {attendedCount}
          </p>
        </div>
      </div>

      {/* Main Split: Profile Editor + Personal Event Tracking */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        {/* Left Column: Profile + Password */}
        <div className="space-y-6 lg:col-span-5">
          {/* Profile Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Mon profil adhérent
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Ces informations pré-remplissent vos réservations et apparaissent sur votre suivi coach.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
            <PhotoUploadField
              label="Photo de profil"
              name={fullName}
              photoUrl={photoUrl}
              onChange={setPhotoUrl}
              stacked
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="my-member-firstname"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Prénom *
                </label>
                <input
                  id="my-member-firstname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.FIRST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label
                  htmlFor="my-member-lastname"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Nom *
                </label>
                <input
                  id="my-member-lastname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.LAST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="my-member-email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Adresse email connectée
              </label>
              <input
                id="my-member-email"
                type="email"
                readOnly
                value={user.email || ''}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
              />
            </div>

            <div>
              <label
                htmlFor="my-member-phone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Téléphone
              </label>
              <input
                id="my-member-phone"
                type="tel"
                maxLength={VALIDATION_LIMITS.PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label
                  htmlFor="my-member-birthdate"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Date de naissance
                </label>
                <input
                  id="my-member-birthdate"
                  type="date"
                  min="1900-01-01"
                  max={todayIso}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-4">
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Âge (auto)
                </span>
                <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-semibold text-slate-800 tabular-nums dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                  {computedAge !== null ? `${computedAge} ans` : '—'}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="my-member-fitness-level"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Niveau sportif
              </label>
              <select
                id="my-member-fitness-level"
                value={fitnessLevel}
                onChange={(e) =>
                  setFitnessLevel(e.target.value as FitnessLevel | '')
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Sélectionner votre niveau</option>
                {FITNESS_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="my-member-goal"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Objectif sportif
              </label>
              <input
                id="my-member-goal"
                type="text"
                maxLength={VALIDATION_LIMITS.GOAL_MAX}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ex. Remise en forme, endurance, mobilité..."
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            {feedback && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Enregistrement...' : 'Enregistrer mon profil'}
            </button>
          </form>
          </div>

          <PasswordSettingsCard user={user} stacked collapsible />
        </div>

        {/* Event Tracking Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Mon suivi des événements
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Retrouvez vos séances réservées et l’historique de vos présences.
              </p>
            </div>

            <div
              role="group"
              aria-label="Filtrer mes événements"
              className="inline-flex flex-wrap items-center gap-1 self-start rounded-lg bg-slate-100 p-1 dark:bg-slate-800 sm:self-auto"
            >
              <button
                type="button"
                onClick={() => {
                  setTrackingTab('upcoming');
                  setConfirmCancelRegId(null);
                }}
                className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  trackingTab === 'upcoming'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                À venir ({upcomingRegistrations.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrackingTab('history');
                  setConfirmCancelRegId(null);
                }}
                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  trackingTab === 'history'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                <span>Historique ({pastRegistrations.length})</span>
                {endedUnvalidatedRegistrations.length > 0 && (
                  <span
                    aria-label={`${endedUnvalidatedRegistrations.length} séance(s) à valider`}
                    className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 font-mono text-[10px] font-bold text-white tabular-nums"
                  >
                    {endedUnvalidatedRegistrations.length}
                  </span>
                )}
              </button>
              {(cancelledRegistrations.length > 0 || trackingTab === 'cancelled') && (
                <button
                  type="button"
                  onClick={() => {
                    setTrackingTab('cancelled');
                    setConfirmCancelRegId(null);
                  }}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap cursor-pointer ${
                    trackingTab === 'cancelled'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  Annulées ({cancelledRegistrations.length})
                </button>
              )}
            </div>
          </div>

          {endedUnvalidatedRegistrations.length > 0 && (
            <div className="mt-4 flex flex-col gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-800 dark:bg-amber-950/45 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5 min-w-0">
                <BellRing
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300"
                  aria-hidden="true"
                />
                <div className="text-xs text-amber-950 dark:text-amber-100">
                  <p className="font-semibold">
                    {endedUnvalidatedRegistrations.length === 1
                      ? '1 séance terminée attend votre validation'
                      : `${endedUnvalidatedRegistrations.length} séances terminées attendent votre validation`}
                  </p>
                  <p className="mt-0.5 text-amber-900/80 dark:text-amber-200/85">
                    Pensez à valider les séances que vous venez d’effectuer.
                  </p>
                </div>
              </div>
              {trackingTab !== 'history' && (
                <button
                  type="button"
                  onClick={() => setTrackingTab('history')}
                  className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 whitespace-nowrap cursor-pointer"
                >
                  Valider dans l’historique
                </button>
              )}
            </div>
          )}

          {validationError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              {validationError}
            </div>
          )}

          {cancelFeedback && (
            <div
              role="status"
              className={`mt-3 rounded-lg border p-3 text-xs ${
                cancelFeedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              {cancelFeedback.text}
            </div>
          )}

          {displayedRegistrations.length === 0 ? (
            <div className="py-10 text-center">
              <UserCheck
                className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600"
                aria-hidden="true"
              />
              <h4 className="mt-3 font-display text-sm font-bold text-slate-900 dark:text-white">
                {trackingTab === 'upcoming'
                  ? 'Aucune séance réservée à venir'
                  : trackingTab === 'history'
                    ? 'Aucune séance passée pour le moment'
                    : 'Aucune inscription annulée'}
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {trackingTab === 'upcoming'
                  ? 'Parcourez le calendrier pour réserver votre prochaine séance sportive.'
                  : trackingTab === 'history'
                    ? 'Vos séances effectuées et présences validées par l’animateur apparaîtront ici.'
                    : 'Vos réservations annulées apparaîtront ici si vous vous désinscrivez d’une séance.'}
              </p>
              {trackingTab === 'upcoming' && (
                <button
                  type="button"
                  onClick={onExploreCalendar}
                  className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
                >
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Explorer le calendrier
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {displayedRegistrations.map((reg) => {
                const matchedEvent = eventsById.get(reg.eventId) ?? null;
                const startDate = reg.eventStartAt.toDate();
                const startMs = reg.eventStartAt.toMillis();
                const endMs = getRegistrationEndMs(reg, matchedEvent);
                const durationForDisplay =
                  matchedEvent?.durationMinutes ?? reg.eventDurationMinutes;
                const discStyle = matchedEvent
                  ? getDisciplineStyle(matchedEvent.discipline, disciplines)
                  : null;
                const isRegCancelled = reg.status === 'cancelled';
                const isEventCancelled = matchedEvent?.status === 'cancelled';
                const isCancelled = isRegCancelled || isEventCancelled;
                const isEnded = endMs <= nowMs;
                const isOngoing = !isCancelled && startMs <= nowMs && !isEnded;
                const isOwnRegistration =
                  Boolean(user.email) &&
                  reg.email.trim().toLowerCase() === userEmailLower;
                const isHostedGuest =
                  Boolean(reg.isGuest) &&
                  Boolean(user.email) &&
                  (reg.invitedByEmail ?? '').trim().toLowerCase() === userEmailLower;
                const canValidateNow =
                  Boolean(onValidateSession) &&
                  isOwnRegistration &&
                  isEnded &&
                  !isCancelled &&
                  !reg.attended;
                const canCancelReg =
                  Boolean(onCancelRegistration) &&
                  (isOwnRegistration || isHostedGuest) &&
                  trackingTab === 'upcoming' &&
                  !isCancelled &&
                  !reg.attended &&
                  nowMs < startMs;
                const isConfirmingCancel = confirmCancelRegId === reg.id;
                const isCancelling = cancellingRegId === reg.id;
                const isValidating = validatingRegId === reg.id;
                const payInfo = getRegistrationPaymentBadgeInfo(reg);
                const hasReceipt =
                  typeof reg.amountCents === 'number' &&
                  reg.amountCents > 0 &&
                  Boolean(reg.paymentReference);

                return (
                  <div
                    key={reg.id}
                    className="rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {matchedEvent && discStyle && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-sm ${discStyle.swatchBg}`}
                                aria-hidden="true"
                              />
                              {matchedEvent.discipline}
                            </span>
                          )}

                          {isRegCancelled ? (
                            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                              Inscription annulée
                            </span>
                          ) : isEventCancelled ? (
                            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">
                              Séance annulée
                            </span>
                          ) : reg.attended ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Séance validée
                            </span>
                          ) : isOngoing ? (
                            <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">
                              Séance en cours
                            </span>
                          ) : trackingTab === 'upcoming' ? (
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              Place confirmée
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              À valider
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                              payInfo.status === 'paid'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : payInfo.status === 'pending'
                                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : payInfo.status === 'refunded'
                                    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {payInfo.shortLabel}
                          </span>

                          {isHostedGuest && (
                            <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                              Invité : {reg.firstName} {reg.lastName}
                            </span>
                          )}
                          {!isHostedGuest && reg.isGuest && reg.invitedByName && (
                            <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                              Invité par {reg.invitedByName}
                            </span>
                          )}
                        </div>

                        <h4 className="font-display text-base font-bold text-slate-900 dark:text-white">
                          {matchedEvent?.title || reg.eventTitle}
                        </h4>

                        {isHostedGuest && (
                          <p className="text-xs text-sky-800 dark:text-sky-300">
                            Accompagnant inscrit : {reg.firstName} {reg.lastName} ({reg.email})
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums capitalize">
                            <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                            {typeof durationForDisplay === 'number' &&
                            durationForDisplay > 0
                              ? `${formatFrenchDateShort(startDate)} · ${formatTimeRange(
                                  startDate,
                                  durationForDisplay
                                )}`
                              : `${formatFrenchDateLong(startDate)} · ${formatFrenchTime(
                                  startDate
                                )}`}
                          </span>

                          {matchedEvent && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                              {matchedEvent.location} · {matchedEvent.city}
                            </span>
                          )}

                          {reg.paymentReference && (
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              Réf. {reg.paymentReference}
                            </span>
                          )}
                        </div>
                      </div>

                      {(matchedEvent || canValidateNow || canCancelReg || hasReceipt) && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {canValidateNow && (
                            <button
                              type="button"
                              disabled={isValidating}
                              onClick={() => void handleValidateSession(reg)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {isValidating ? 'Validation...' : 'Valider ma séance'}
                            </button>
                          )}
                          {hasReceipt && (
                            <button
                              type="button"
                              onClick={() =>
                                downloadPaymentReceipt({
                                  event: matchedEvent ?? {
                                    id: reg.eventId,
                                    title: reg.eventTitle,
                                    discipline: 'Séance sportive',
                                    location: '',
                                    city: '',
                                    startAt: reg.eventStartAt,
                                    coachName: 'Animateur GetFitNow',
                                  },
                                  memberName: `${reg.firstName} ${reg.lastName}`.trim(),
                                  memberEmail: reg.email,
                                  amountCents: reg.amountCents ?? 0,
                                  method:
                                    reg.paymentMethod === 'onsite'
                                      ? 'onsite'
                                      : 'card',
                                  status:
                                    payInfo.status === 'paid' ||
                                    payInfo.status === 'refunded'
                                      ? payInfo.status
                                      : 'pending',
                                  reference: reg.paymentReference ?? '',
                                  cardBrand: reg.cardBrand,
                                  cardLast4: reg.cardLast4,
                                })
                              }
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                              Reçu
                            </button>
                          )}
                          {matchedEvent && trackingTab === 'upcoming' && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => downloadEventIcs(matchedEvent)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                              Agenda .ics
                            </button>
                          )}
                          {matchedEvent && (
                            <button
                              type="button"
                              onClick={() => onSelectEvent(matchedEvent)}
                              className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              Détails & carte
                            </button>
                          )}
                          {canCancelReg && !isConfirmingCancel && (
                            <button
                              type="button"
                              onClick={() => {
                                setCancelFeedback(null);
                                setConfirmCancelRegId(reg.id);
                              }}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/70 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/50 cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Annuler
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {isConfirmingCancel && canCancelReg && (
                      <div className="mt-3 flex flex-col gap-2.5 rounded-lg border border-rose-200 bg-rose-50/80 p-3 dark:border-rose-900/80 dark:bg-rose-950/40 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-rose-950 dark:text-rose-100">
                          <strong>Confirmer l’annulation ?</strong>{' '}
                          {isHostedGuest
                            ? `La place de ${reg.firstName} ${reg.lastName} sera libérée.`
                            : 'Votre place sera libérée.'}
                          {reg.paymentStatus === 'paid' && (reg.amountCents ?? 0) > 0
                            ? ` Le paiement de ${formatPriceEuros(reg.amountCents ?? 0)} sera marqué comme remboursé.`
                            : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => void handleConfirmCancelRegistration(reg)}
                            className="inline-flex min-h-[36px] items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                          >
                            {isCancelling ? 'Annulation...' : 'Confirmer l’annulation'}
                          </button>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => setConfirmCancelRegId(null)}
                            className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            Conserver ma place
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
