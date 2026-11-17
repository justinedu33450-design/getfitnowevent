import { FormEvent, useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  Download,
  RotateCcw,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { BOOTSTRAPPED_COACH_EMAIL } from '../firebase';
import {
  CoachAdminUser,
  MemberProfile,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  registerForEvent,
  removeRegistration,
  toggleRegistrationAttendance,
  updateRegistrationPaymentStatus,
} from '../services/firestoreService';
import {
  calculateAgeFromBirthDate,
  exportCsv,
  formatEventPrice,
  formatFitnessLevelLabel,
  formatFrenchDateLong,
  formatFrenchTime,
  formatPaymentModeLabel,
  formatPriceEuros,
  formatTimeRange,
  getRegistrationPaymentBadgeInfo,
} from '../utils/dateAndValidation';

interface EventRosterDrawerProps {
  event: SportEvent;
  registrations: Registration[];
  memberProfiles?: MemberProfile[];
  coachAdmins?: CoachAdminUser[];
  onClose: () => void;
}

export function EventRosterDrawer({
  event,
  registrations,
  memberProfiles = [],
  coachAdmins = [],
  onClose,
}: EventRosterDrawerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [markPaidAsCoach, setMarkPaidAsCoach] = useState(false);
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isPaidEvent =
    Boolean(event.isPaid) &&
    typeof event.priceCents === 'number' &&
    event.priceCents >= VALIDATION_LIMITS.PRICE_MIN_CENTS;

  const eventRegistrations = useMemo(() => {
    return registrations
      .filter((r) => r.eventId === event.id && r.status === 'confirmed')
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
  }, [registrations, event.id]);

  const profileByKeyOrEmail = useMemo(() => {
    const byKey = new Map<string, MemberProfile>();
    const byEmail = new Map<string, MemberProfile>();
    memberProfiles.forEach((p) => {
      if (p.emailKey) byKey.set(p.emailKey, p);
      if (p.email) byEmail.set(p.email.trim().toLowerCase(), p);
    });
    return { byKey, byEmail };
  }, [memberProfiles]);

  const coachEmailSet = useMemo(() => {
    const set = new Set<string>([
      BOOTSTRAPPED_COACH_EMAIL.trim().toLowerCase(),
    ]);
    coachAdmins.forEach((c) => {
      if (c.email?.trim()) set.add(c.email.trim().toLowerCase());
    });
    return set;
  }, [coachAdmins]);

  const isCoachParticipant = (reg: Registration) =>
    !reg.isGuest && coachEmailSet.has(reg.email.trim().toLowerCase());

  const getParticipantProfileSummary = (reg: Registration) => {
    if (reg.isGuest || isCoachParticipant(reg)) {
      return { ageLabel: '', levelLabel: '', levelShortLabel: '' };
    }
    const matched =
      profileByKeyOrEmail.byKey.get(reg.emailKey) ??
      profileByKeyOrEmail.byEmail.get(reg.email.trim().toLowerCase());
    if (!matched) return { ageLabel: '', levelLabel: '', levelShortLabel: '' };
    const age = calculateAgeFromBirthDate(matched.birthDate);
    return {
      ageLabel: age !== null ? `${age} ans` : '',
      levelLabel: formatFitnessLevelLabel(matched.fitnessLevel),
      levelShortLabel: formatFitnessLevelLabel(matched.fitnessLevel, true),
    };
  };

  const presentCount = eventRegistrations.filter((r) => r.attended).length;

  const financialSummary = useMemo(() => {
    let collectedCents = 0;
    let pendingCents = 0;
    let refundedCents = 0;
    eventRegistrations.forEach((r) => {
      const amount = typeof r.amountCents === 'number' ? r.amountCents : 0;
      if (amount <= 0) return;
      if (r.paymentStatus === 'paid') {
        collectedCents += amount;
      } else if (r.paymentStatus === 'refunded') {
        refundedCents += amount;
      } else if (r.paymentStatus === 'pending') {
        pendingCents += amount;
      }
    });
    return { collectedCents, pendingCents, refundedCents };
  }, [eventRegistrations]);

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setAdding(true);
    try {
      await registerForEvent({
        event,
        firstName,
        lastName,
        email,
        bypassCutoffAsCoach: true,
        payment: isPaidEvent
          ? { method: 'onsite', markPaidAsCoach }
          : { method: 'free' },
      });
      setFirstName('');
      setLastName('');
      setEmail('');
      setMarkPaidAsCoach(false);
      setShowAddForm(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Impossible d’ajouter ce participant.'
      );
    } finally {
      setAdding(false);
    }
  };

  const handleUpdatePayment = async (
    reg: Registration,
    nextStatus: 'paid' | 'pending' | 'refunded'
  ) => {
    setPaymentActionError(null);
    setUpdatingPaymentId(reg.id);
    try {
      await updateRegistrationPaymentStatus(reg, nextStatus);
    } catch (err) {
      setPaymentActionError(
        err instanceof Error
          ? err.message
          : 'Impossible de mettre à jour le paiement.'
      );
    } finally {
      setUpdatingPaymentId(null);
    }
  };

  const handleExportCsv = () => {
    exportCsv(
      `participants-${event.id}.csv`,
      [
        'Nom',
        'Prénom',
        'Email',
        'Âge',
        'Niveau sportif',
        'Invité par',
        'Présence',
        'Tarif',
        'Statut paiement',
        'Référence',
        'Date inscription',
      ],
      eventRegistrations.map((r) => {
        const payInfo = getRegistrationPaymentBadgeInfo(r);
        const profileInfo = getParticipantProfileSummary(r);
        return [
          r.lastName,
          r.firstName,
          r.email,
          profileInfo.ageLabel,
          profileInfo.levelLabel,
          r.isGuest ? r.invitedByName || r.invitedByEmail || 'Oui' : '',
          r.attended ? 'Présent' : 'Non pointé',
          payInfo.amountLabel,
          payInfo.label,
          r.paymentReference || '',
          r.createdAt ? r.createdAt.toDate().toLocaleString('fr-FR') : '',
        ];
      })
    );
  };

  const isFull =
    !event.isUnlimitedCapacity && event.registeredCount >= event.maxCapacity;

  const renderPaymentBadge = (reg: Registration) => {
    const info = getRegistrationPaymentBadgeInfo(reg);
    if (info.status === 'free') {
      return (
        <span className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Gratuit
        </span>
      );
    }
    if (info.status === 'paid') {
      return (
        <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-800 tabular-nums dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
          {info.shortLabel}
        </span>
      );
    }
    if (info.status === 'refunded') {
      return (
        <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-800 tabular-nums dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
          {info.shortLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        {info.shortLabel}
      </span>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-drawer-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-xs sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:h-full sm:rounded-none sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-6">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize">
              {formatFrenchDateLong(event.startAt.toDate())} ·{' '}
              {formatTimeRange(event.startAt.toDate(), event.durationMinutes)}
            </p>
            <h2
              id="roster-drawer-title"
              className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
            >
              {event.title}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              {event.isUnlimitedCapacity
                ? `${eventRegistrations.length} inscrit${eventRegistrations.length > 1 ? 's' : ''} · Places illimitées`
                : `${eventRegistrations.length}/${event.maxCapacity} inscrits`}{' '}
              · {presentCount} présent{presentCount > 1 ? 's' : ''} pointé
              {presentCount > 1 ? 's' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la liste des participants"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Paid Event Financial Summary Bar */}
        {isPaidEvent && (
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/80 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="px-4 py-2.5 sm:px-6">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Tarif ({formatPaymentModeLabel(event.paymentMode)})
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                {formatEventPrice(event)}
              </p>
            </div>
            <div className="px-4 py-2.5 sm:px-6">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Encaissé
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatPriceEuros(financialSummary.collectedCents)}
              </p>
            </div>
            <div className="px-4 py-2.5 sm:px-6">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                À encaisser sur place
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {formatPriceEuros(financialSummary.pendingCents)}
              </p>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/60 sm:px-6">
          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            disabled={isFull}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white disabled:opacity-50 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Ajouter un participant
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={eventRegistrations.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter CSV
          </button>
        </div>

        {/* Manual Add Form */}
        {showAddForm && (
          <form
            onSubmit={handleManualAdd}
            className="space-y-3 border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40 sm:p-6"
          >
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              Ajout manuel par l’animateur (autorisé même à moins d’1h du début)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                placeholder="Prénom"
                maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:text-xs"
              />
              <input
                type="text"
                required
                placeholder="Nom"
                maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:text-xs"
              />
              <input
                type="email"
                required
                placeholder="Email"
                maxLength={VALIDATION_LIMITS.EMAIL_MAX}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 sm:text-xs"
              />
            </div>

            {isPaidEvent && (
              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markPaidAsCoach}
                  onChange={(e) => setMarkPaidAsCoach(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                <span>
                  Déjà réglé sur place / espèces (
                  <strong className="font-mono tabular-nums">
                    {formatEventPrice(event)}
                  </strong>
                  )
                </span>
              </label>
            )}

            {errorMsg && (
              <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                {errorMsg}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={adding}
                className="min-h-[40px] rounded-lg bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
              >
                {adding ? 'Ajout...' : 'Inscrire'}
              </button>
            </div>
          </form>
        )}

        {/* Roster List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {paymentActionError && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              {paymentActionError}
            </div>
          )}

          {eventRegistrations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Aucun participant inscrit pour le moment
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Les réservations effectuées depuis le calendrier apparaîtront ici en temps réel.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Participant Cards (< sm) */}
              <div className="space-y-2.5 sm:hidden">
                {eventRegistrations.map((reg) => {
                  const payInfo = getRegistrationPaymentBadgeInfo(reg);
                  const profileInfo = getParticipantProfileSummary(reg);
                  const participantIsCoach = isCoachParticipant(reg);
                  const isUpdatingPay = updatingPaymentId === reg.id;
                  return (
                    <div
                      key={reg.id}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {reg.firstName} {reg.lastName}
                            </p>
                            {participantIsCoach && (
                              <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                Coach
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {reg.email}
                          </p>
                          {(profileInfo.ageLabel || profileInfo.levelShortLabel) && (
                            <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                              {[profileInfo.ageLabel, profileInfo.levelShortLabel]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          {reg.isGuest && (
                            <p className="mt-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                              Invité par {reg.invitedByName || reg.invitedByEmail}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {reg.createdAt
                            ? formatFrenchTime(reg.createdAt.toDate())
                            : '—'}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {renderPaymentBadge(reg)}
                        {reg.paymentReference && (
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {reg.paymentReference}
                          </span>
                        )}
                      </div>

                      {payInfo.status !== 'free' && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {(payInfo.status === 'pending' ||
                            payInfo.status === 'refunded') && (
                            <button
                              type="button"
                              disabled={isUpdatingPay}
                              onClick={() => void handleUpdatePayment(reg, 'paid')}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 disabled:opacity-60 cursor-pointer"
                            >
                              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                              Marquer payé
                            </button>
                          )}
                          {payInfo.status === 'paid' && (
                            <button
                              type="button"
                              disabled={isUpdatingPay}
                              onClick={() => void handleUpdatePayment(reg, 'refunded')}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              Rembourser
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void toggleRegistrationAttendance(reg.id, !reg.attended)
                          }
                          className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                            reg.attended
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                          {reg.attended ? 'Présent' : 'Pointer présent'}
                        </button>

                        {confirmDeleteId === reg.id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await removeRegistration(
                                  reg,
                                  event.registeredCount
                                );
                                setConfirmDeleteId(null);
                              }}
                              className="min-h-[44px] rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                            >
                              Confirmer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(reg.id)}
                            aria-label={`Désinscrire ${reg.firstName} ${reg.lastName}`}
                            className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Participant Table (>= sm) */}
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 sm:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Participant</th>
                      <th className="px-4 py-3">Paiement</th>
                      <th className="px-4 py-3">Inscrit à</th>
                      <th className="px-4 py-3 text-right">Présence & Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {eventRegistrations.map((reg) => {
                      const payInfo = getRegistrationPaymentBadgeInfo(reg);
                      const profileInfo = getParticipantProfileSummary(reg);
                      const participantIsCoach = isCoachParticipant(reg);
                      const isUpdatingPay = updatingPaymentId === reg.id;
                      return (
                        <tr
                          key={reg.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {reg.firstName} {reg.lastName}
                              </p>
                              {participantIsCoach && (
                                <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  Coach
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {reg.email}
                            </p>
                            {(profileInfo.ageLabel || profileInfo.levelShortLabel) && (
                              <p className="mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                {[profileInfo.ageLabel, profileInfo.levelShortLabel]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            )}
                            {reg.isGuest && (
                              <p className="mt-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                                Invité par {reg.invitedByName || reg.invitedByEmail}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-start gap-1">
                              {renderPaymentBadge(reg)}
                              {reg.paymentReference && (
                                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                  {reg.paymentReference}
                                </span>
                              )}
                              {payInfo.status !== 'free' && (
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  {(payInfo.status === 'pending' ||
                                    payInfo.status === 'refunded') && (
                                    <button
                                      type="button"
                                      disabled={isUpdatingPay}
                                      onClick={() =>
                                        void handleUpdatePayment(reg, 'paid')
                                      }
                                      className="text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400 disabled:opacity-60 cursor-pointer"
                                    >
                                      Marquer payé
                                    </button>
                                  )}
                                  {payInfo.status === 'paid' && (
                                    <button
                                      type="button"
                                      disabled={isUpdatingPay}
                                      onClick={() =>
                                        void handleUpdatePayment(reg, 'refunded')
                                      }
                                      className="text-[11px] font-medium text-slate-600 hover:text-rose-700 hover:underline dark:text-slate-300 dark:hover:text-rose-400 disabled:opacity-60 cursor-pointer"
                                    >
                                      Rembourser
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {reg.createdAt
                              ? formatFrenchTime(reg.createdAt.toDate())
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  void toggleRegistrationAttendance(
                                    reg.id,
                                    !reg.attended
                                  )
                                }
                                className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                  reg.attended
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                {reg.attended ? 'Présent' : 'Pointer'}
                              </button>

                              {confirmDeleteId === reg.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await removeRegistration(
                                        reg,
                                        event.registeredCount
                                      );
                                      setConfirmDeleteId(null);
                                    }}
                                    className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                  >
                                    Confirmer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="min-h-[34px] rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    Non
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(reg.id)}
                                  title="Désinscrire"
                                  aria-label={`Désinscrire ${reg.firstName} ${reg.lastName}`}
                                  className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
