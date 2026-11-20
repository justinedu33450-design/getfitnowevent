import { FormEvent, useMemo, useState } from 'react';
import {
  CalendarPlus,
  CreditCard,
  Footprints,
  Gauge,
  Timer,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CoachDirectoryEntry,
  EventPaymentMode,
  RunningDistanceKey,
  TrainingProgram,
  VALIDATION_LIMITS,
} from '../types';
import {
  createTrainingProgram,
  updateTrainingProgramConfig,
} from '../services/firestoreService';
import {
  formatPriceEuros,
  toLocalDateInputValue,
} from '../utils/dateAndValidation';
import {
  computeTargetRacePaceSecPerKm,
  formatDurationHMS,
  formatPaceMinPerKm,
  getDefaultPreferredDays,
  normalizePreferredDays,
  RUNNING_DISTANCE_LIST,
  RUNNING_DISTANCE_TEMPLATES,
  WEEKDAY_OPTIONS,
} from '../utils/runningProgramGenerator';
import { ProgramMemberCandidate } from './ProgramBuilderModal';

interface RunningProgramBuilderModalProps {
  coachUid: string;
  coachName: string;
  coachDirectory: CoachDirectoryEntry[];
  memberCandidates: ProgramMemberCandidate[];
  initialMember?: ProgramMemberCandidate | null;
  initialDistance?: RunningDistanceKey;
  editingProgram?: TrainingProgram | null;
  onClose: () => void;
  onSaved?: (message: string) => void;
}

function splitSecondsToHMS(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const safe = Math.max(0, Math.round(totalSeconds));
  return {
    h: Math.floor(safe / 3600),
    m: Math.floor((safe % 3600) / 60),
    s: safe % 60,
  };
}

export function RunningProgramBuilderModal({
  coachUid,
  coachName,
  coachDirectory,
  memberCandidates,
  initialMember = null,
  initialDistance = '10km',
  editingProgram = null,
  onClose,
  onSaved,
}: RunningProgramBuilderModalProps) {
  const defaultMemberEmail =
    editingProgram?.memberEmail ||
    initialMember?.email ||
    memberCandidates[0]?.email ||
    '';

  const [selectedMemberEmail, setSelectedMemberEmail] =
    useState(defaultMemberEmail);

  const selectedMember = useMemo(() => {
    const clean = selectedMemberEmail.trim().toLowerCase();
    const fromList = memberCandidates.find(
      (m) => m.email.trim().toLowerCase() === clean
    );
    if (fromList) return fromList;
    if (initialMember && initialMember.email.trim().toLowerCase() === clean) {
      return initialMember;
    }
    if (editingProgram) {
      return {
        email: editingProgram.memberEmail,
        emailKey: editingProgram.memberEmailKey,
        name: editingProgram.memberName,
      };
    }
    return null;
  }, [selectedMemberEmail, memberCandidates, initialMember, editingProgram]);

  const [distance, setDistance] = useState<RunningDistanceKey>(
    editingProgram?.distance ?? initialDistance
  );
  const tpl = RUNNING_DISTANCE_TEMPLATES[distance];

  const [title, setTitle] = useState(
    editingProgram?.title || `${tpl.label} · 12 semaines`
  );
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(
    editingProgram?.sessionsPerWeek ?? tpl.defaultSessionsPerWeek
  );
  const [preferredDays, setPreferredDays] = useState<number[]>(
    editingProgram?.preferredDays ??
      getDefaultPreferredDays(tpl.defaultSessionsPerWeek)
  );

  const initialHMS = splitSecondsToHMS(
    editingProgram?.targetTimeSeconds ?? tpl.defaultTargetTimeSeconds
  );
  const [targetHours, setTargetHours] = useState<number>(initialHMS.h);
  const [targetMinutes, setTargetMinutes] = useState<number>(initialHMS.m);
  const [targetSeconds, setTargetSeconds] = useState<number>(initialHMS.s);

  const [startDateStr, setStartDateStr] = useState<string>(() =>
    editingProgram
      ? toLocalDateInputValue(editingProgram.startAt.toDate())
      : toLocalDateInputValue(new Date())
  );

  const [priceEuros, setPriceEuros] = useState<string>(() =>
    ((editingProgram?.priceCents ?? tpl.defaultPriceCents) / 100).toFixed(2)
  );
  const [paymentMode, setPaymentMode] = useState<EventPaymentMode>(
    editingProgram?.paymentMode ?? 'both'
  );
  const [markPaid, setMarkPaid] = useState<boolean>(false);

  const [coachRefUid, setCoachRefUid] = useState<string>(
    editingProgram?.coachUid || coachUid
  );
  const [notes, setNotes] = useState<string>(editingProgram?.notes || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetTotalSeconds =
    Math.max(0, targetHours) * 3600 +
    Math.max(0, targetMinutes) * 60 +
    Math.max(0, targetSeconds);

  const targetPaceSecPerKm = useMemo(
    () =>
      computeTargetRacePaceSecPerKm(
        distance,
        Math.max(
          VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC,
          targetTotalSeconds
        )
      ),
    [distance, targetTotalSeconds]
  );

  const handleDistanceChange = (nextDist: RunningDistanceKey) => {
    if (editingProgram) return;
    setDistance(nextDist);
    const nextTpl = RUNNING_DISTANCE_TEMPLATES[nextDist];
    setTitle(`${nextTpl.label} · 12 semaines`);
    setSessionsPerWeek(nextTpl.defaultSessionsPerWeek);
    setPreferredDays(getDefaultPreferredDays(nextTpl.defaultSessionsPerWeek));
    const hms = splitSecondsToHMS(nextTpl.defaultTargetTimeSeconds);
    setTargetHours(hms.h);
    setTargetMinutes(hms.m);
    setTargetSeconds(hms.s);
    setPriceEuros((nextTpl.defaultPriceCents / 100).toFixed(2));
  };

  const handleSessionsPerWeekChange = (count: number) => {
    const clamped = Math.min(
      VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MAX,
      Math.max(VALIDATION_LIMITS.PROGRAM_SESSIONS_PER_WEEK_MIN, count)
    );
    setSessionsPerWeek(clamped);
    setPreferredDays((prev) => normalizePreferredDays(prev, clamped));
  };

  const togglePreferredDay = (day: number) => {
    setPreferredDays((prev) => {
      const exists = prev.includes(day);
      if (exists) {
        if (prev.length <= 1) return prev;
        return prev.filter((d) => d !== day);
      }
      if (prev.length >= sessionsPerWeek) {
        return [...prev.slice(1), day].sort((a, b) => a - b);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetEmail =
      editingProgram?.memberEmail ||
      selectedMember?.email ||
      selectedMemberEmail;
    const targetName =
      editingProgram?.memberName ||
      selectedMember?.name ||
      targetEmail.split('@')[0] ||
      'Adhérent';

    if (!targetEmail || !VALIDATION_LIMITS.EMAIL_REGEX.test(targetEmail.trim())) {
      setError('Veuillez sélectionner un adhérent valide.');
      return;
    }

    if (
      targetTotalSeconds < VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MIN_SEC ||
      targetTotalSeconds > VALIDATION_LIMITS.PROGRAM_TARGET_TIME_MAX_SEC
    ) {
      setError(
        'Veuillez saisir un objectif chronométrique réaliste (entre 10 min et 10h).'
      );
      return;
    }

    const parsedPrice = Number(priceEuros.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
      setError(
        'Tous les programmes personnalisés sont payants : le tarif minimum est de 1,00 €.'
      );
      return;
    }
    const priceCents = Math.min(
      VALIDATION_LIMITS.PROGRAM_PRICE_MAX_CENTS,
      Math.round(parsedPrice * 100)
    );

    if (!startDateStr) {
      setError('Veuillez sélectionner la date de début (Jour 1 · Test VMA).');
      return;
    }

    const [y, m, d] = startDateStr.split('-').map(Number);
    // Start of Day 1 (00:00 local) so Day 1 VMA test is immediately unlocked on Day 1
    const startDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (Number.isNaN(startDate.getTime())) {
      setError('Date de début invalide.');
      return;
    }

    const normalizedDays = normalizePreferredDays(
      preferredDays,
      sessionsPerWeek
    );
    const selectedCoach = coachDirectory.find((c) => c.uid === coachRefUid);
    const resolvedCoachUid = (coachRefUid || coachUid).trim();
    const resolvedCoachName =
      selectedCoach?.displayName || coachName || 'Coach';

    setSaving(true);
    try {
      if (editingProgram) {
        await updateTrainingProgramConfig(editingProgram.id, {
          title,
          sessionsPerWeek,
          preferredDays: normalizedDays,
          targetTimeSeconds: targetTotalSeconds,
          startDate,
          notes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          priceCents,
          paymentMode,
        });
        onSaved?.(
          `Programme « ${title} » mis à jour pour ${targetName}.`
        );
      } else {
        await createTrainingProgram({
          memberEmail: targetEmail,
          memberName: targetName,
          title,
          distance,
          sessionsPerWeek,
          preferredDays: normalizedDays,
          targetTimeSeconds: targetTotalSeconds,
          startDate,
          notes,
          coachUid: resolvedCoachUid,
          coachName: resolvedCoachName,
          priceCents,
          paymentMode,
          markPaid,
          createdByUid: coachUid,
        });
        onSaved?.(
          `Programme ${tpl.shortLabel} sur 12 semaines (${formatPriceEuros(priceCents)}) attribué à ${targetName}.`
        );
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer le programme running.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="running-program-builder-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400">
              <Footprints className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="running-program-builder-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white"
              >
                {editingProgram
                  ? `Modifier le programme ${tpl.shortLabel}`
                  : 'Créer un programme running 12 semaines'}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Plan spécifique 5 km, 10 km, 21 km ou 42 km · Test VMA au Jour 1 +
                allures calibrées · Programme payant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Distance selector (5km, 10km, 21km, 42km) */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Distance cible (programme 12 semaines) *
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {RUNNING_DISTANCE_LIST.map((item) => {
                  const active = distance === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled={Boolean(editingProgram)}
                      onClick={() => handleDistanceChange(item.key)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        editingProgram ? 'opacity-80 cursor-default' : 'cursor-pointer'
                      } ${
                        active
                          ? 'border-sky-600 bg-sky-50/80 text-sky-950 dark:border-sky-500 dark:bg-sky-950/60 dark:text-sky-100'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300'
                      }`}
                    >
                      <p className="font-mono text-base font-bold tabular-nums">
                        {item.shortLabel}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        12 sem. · {formatPriceEuros(item.defaultPriceCents)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Member & Title */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rp-member"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Adhérent destinataire *
                </label>
                {editingProgram || initialMember ? (
                  <div className="mt-1 flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <UserCheck
                      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {selectedMember?.name || selectedMemberEmail}
                    </span>
                  </div>
                ) : (
                  <select
                    id="rp-member"
                    required
                    value={selectedMemberEmail}
                    onChange={(e) => setSelectedMemberEmail(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Sélectionner un adhérent...</option>
                    {memberCandidates.map((m) => (
                      <option key={m.emailKey} value={m.email}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label
                  htmlFor="rp-title"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Intitulé du programme *
                </label>
                <input
                  id="rp-title"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.TITLE_MIN}
                  maxLength={VALIDATION_LIMITS.TITLE_MAX}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Objectif temps + Start date (Day 1 VMA) */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <Timer className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  Objectif temps de l’adhérent ({tpl.shortLabel}) *
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="rp-hours"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Heures
                    </label>
                    <input
                      id="rp-hours"
                      type="number"
                      min={0}
                      max={9}
                      value={targetHours}
                      onChange={(e) =>
                        setTargetHours(Math.max(0, Math.min(9, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rp-mins"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Minutes
                    </label>
                    <input
                      id="rp-mins"
                      type="number"
                      min={0}
                      max={59}
                      value={targetMinutes}
                      onChange={(e) =>
                        setTargetMinutes(Math.max(0, Math.min(59, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="rp-secs"
                      className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400"
                    >
                      Sec.
                    </label>
                    <input
                      id="rp-secs"
                      type="number"
                      min={0}
                      max={59}
                      value={targetSeconds}
                      onChange={(e) =>
                        setTargetSeconds(Math.max(0, Math.min(59, Math.round(Number(e.target.value) || 0))))
                      }
                      className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                  Objectif : {formatDurationHMS(targetTotalSeconds)} · Allure cible :{' '}
                  {formatPaceMinPerKm(targetPaceSecPerKm)}
                </p>
              </div>

              <div>
                <label
                  htmlFor="rp-start-date"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <Gauge className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Date de début · Jour 1 (Test VMA) *
                </label>
                <input
                  id="rp-start-date"
                  type="date"
                  required
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="mt-2 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                  Le Jour 1 déclenche le test VMA Demi-Cooper (6 min) qui calcule
                  les allures des {12 * sessionsPerWeek - 1} séances suivantes.
                </p>
              </div>
            </div>

            {/* Configurable Frequency (2..6 sessions/week) + Days */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Fréquence hebdomadaire sur 12 semaines *
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {12 * sessionsPerWeek} séances au total
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSessionsPerWeekChange(n)}
                    className={`min-h-[36px] rounded-lg border px-3.5 py-1.5 font-mono text-xs font-bold cursor-pointer ${
                      sessionsPerWeek === n
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-600 dark:text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {n} séances / sem.
                  </button>
                ))}
              </div>

              <div>
                <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Jours d’entraînement préférés ({preferredDays.length}/{sessionsPerWeek} sélectionnés)
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((w) => {
                    const selected = preferredDays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => togglePreferredDay(w.day)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          selected
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Mandatory Paid Pricing */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  Tarification du programme personnalisé (payant par l’adhérent)
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="rp-price"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Tarif du programme (€) *
                  </label>
                  <input
                    id="rp-price"
                    type="number"
                    min={1}
                    max={2000}
                    step="0.50"
                    required
                    value={priceEuros}
                    onChange={(e) => setPriceEuros(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="rp-pay-mode"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Mode de règlement autorisé *
                  </label>
                  <select
                    id="rp-pay-mode"
                    value={paymentMode}
                    onChange={(e) =>
                      setPaymentMode(e.target.value as EventPaymentMode)
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="both">Carte en ligne ou sur place</option>
                    <option value="online">Carte en ligne uniquement</option>
                    <option value="onsite">Sur place uniquement</option>
                  </select>
                </div>
              </div>

              {!editingProgram && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markPaid}
                    onChange={(e) => setMarkPaid(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>L’adhérent a déjà réglé sur place (débloquer immédiatement)</span>
                </label>
              )}
            </div>

            {/* Coach & Notes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rp-coach"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Coach référent
                </label>
                <select
                  id="rp-coach"
                  value={coachRefUid}
                  onChange={(e) => setCoachRefUid(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {coachName && !coachDirectory.some((c) => c.uid === coachUid) && (
                    <option value={coachUid}>{coachName}</option>
                  )}
                  {coachDirectory.map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="rp-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Consignes personnalisées du coach
                </label>
                <input
                  id="rp-notes"
                  type="text"
                  maxLength={VALIDATION_LIMITS.SCHEDULE_NOTES_MAX}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex. Bien respecter l’échauffement avant le test VMA..."
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {/* 4-Phase 12-week structure preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Structure générée sur 12 semaines ({tpl.shortLabel})
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {tpl.phases.map((p) => (
                  <p
                    key={p}
                    className="rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                {error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              L’adhérent verra les 12 semaines dans <strong>Mon suivi</strong> dès
              attribution.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
              >
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                {saving
                  ? 'Enregistrement...'
                  : editingProgram
                    ? 'Mettre à jour le programme'
                    : 'Créer le programme 12 semaines'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
