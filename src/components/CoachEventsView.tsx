import { FormEvent, useState } from 'react';
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  Edit3,
  LogOut,
  MapPin,
  Palette,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  DisciplineColorKey,
  DisciplineItem,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  createCustomDiscipline,
  deleteCustomDiscipline,
  deleteEvent,
  seedDemoEvents,
  updateCustomDisciplineColor,
} from '../services/firestoreService';
import {
  evaluateEventBooking,
  exportCsv,
  formatCapacityCompact,
  formatEventCoachesLabel,
  formatEventPrice,
  formatFrenchDateShort,
  formatPaymentModeLabel,
  formatPriceEuros,
  formatTimeRange,
  getEventCoachNames,
} from '../utils/dateAndValidation';
import {
  DISCIPLINE_COLOR_KEYS,
  DISCIPLINE_COLOR_PRESETS,
  getDisciplineStyle,
} from '../utils/disciplineColors';

interface CoachEventsViewProps {
  coachUid: string;
  coachEmail: string;
  coachName: string;
  events: SportEvent[];
  registrations: Registration[];
  disciplines: DisciplineItem[];
  nowMs: number;
  isCoachAdmin?: boolean;
  pendingCoachRequestsCount?: number;
  onOpenCoachesAdmin?: () => void;
  onSignOut: () => void;
  onCreateEvent: () => void;
  onEditEvent: (event: SportEvent) => void;
  onDuplicateEvent: (event: SportEvent) => void;
  onOpenRoster: (event: SportEvent) => void;
}

export function CoachEventsView({
  coachUid,
  coachEmail,
  coachName,
  events,
  registrations,
  disciplines,
  nowMs,
  isCoachAdmin = false,
  pendingCoachRequestsCount = 0,
  onOpenCoachesAdmin,
  onSignOut,
  onCreateEvent,
  onEditEvent,
  onDuplicateEvent,
  onOpenRoster,
}: CoachEventsViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [eventActionFeedback, setEventActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Discipline management drawer/panel
  const [showDisciplinesPanel, setShowDisciplinesPanel] = useState(false);
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscColor, setNewDiscColor] = useState<DisciplineColorKey>('indigo');
  const [confirmDeleteDiscId, setConfirmDeleteDiscId] = useState<string | null>(
    null
  );
  const [discBusy, setDiscBusy] = useState(false);
  const [discFeedback, setDiscFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleConfirmDelete = async (ev: SportEvent) => {
    setEventActionFeedback(null);
    setActionBusyId(ev.id);
    try {
      const result = await deleteEvent(ev.id);
      setConfirmDeleteId(null);
      if (result.notificationsSent > 0) {
        setEventActionFeedback({
          type: 'success',
          text: `La séance « ${ev.title} » a été supprimée. ${result.notificationsSent} notification${
            result.notificationsSent > 1 ? 's ont été envoyées' : ' a été envoyée'
          } aux adhérents inscrits.`,
        });
      } else {
        setEventActionFeedback({
          type: 'success',
          text: `La séance « ${ev.title} » a été supprimée et retirée du planning.`,
        });
      }
    } catch (err) {
      setEventActionFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cet événement pour le moment.',
      });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDemoEvents(coachUid, coachName);
    } finally {
      setSeeding(false);
    }
  };

  const handleAddDiscipline = async (e: FormEvent) => {
    e.preventDefault();
    setDiscFeedback(null);
    setDiscBusy(true);
    try {
      const added = await createCustomDiscipline({
        name: newDiscName,
        colorKey: newDiscColor,
        coachUid,
        existingNames: disciplines.map((d) => d.name),
      });
      setNewDiscName('');
      setDiscFeedback({
        type: 'success',
        text: `Discipline « ${added} » ajoutée au planning.`,
      });
    } catch (err) {
      setDiscFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible d’ajouter cette discipline.',
      });
    } finally {
      setDiscBusy(false);
    }
  };

  const getCollectedCents = (eventId: string): number =>
    registrations
      .filter(
        (r) =>
          r.eventId === eventId &&
          r.status === 'confirmed' &&
          r.paymentStatus === 'paid' &&
          typeof r.amountCents === 'number'
      )
      .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  const handleExportEvents = () => {
    exportCsv(
      'evenements-sportifs.csv',
      [
        'Titre',
        'Discipline',
        'Date',
        'Horaire',
        'Ville',
        'Région',
        'Lieu',
        'Animateur(s)',
        'Tarif',
        'Mode paiement',
        'Encaissé (€)',
        'Inscrits',
        'Capacité',
        'Statut',
      ],
      events.map((ev) => [
        ev.title,
        ev.discipline,
        formatFrenchDateShort(ev.startAt.toDate()),
        formatTimeRange(ev.startAt.toDate(), ev.durationMinutes),
        ev.city || '',
        ev.region || '',
        ev.location,
        getEventCoachNames(ev).join(', ') || ev.coachName,
        formatEventPrice(ev),
        ev.isPaid ? formatPaymentModeLabel(ev.paymentMode) : 'Gratuit',
        ev.isPaid ? formatPriceEuros(getCollectedCents(ev.id)) : '0 €',
        String(ev.registeredCount),
        ev.isUnlimitedCapacity ? 'Illimité' : String(ev.maxCapacity),
        evaluateEventBooking(ev, nowMs).statusLabel,
      ])
    );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Workspace Toolbar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Gestion des événements sportifs
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Connecté en tant que coach ({coachEmail}) · Gérez vos créneaux, disciplines, couleurs et listes d’inscrits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowDisciplinesPanel((prev) => !prev)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium cursor-pointer ${
              showDisciplinesPanel
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            Disciplines ({disciplines.length})
          </button>

          <button
            type="button"
            onClick={handleExportEvents}
            disabled={events.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exporter CSV
          </button>

          <button
            type="button"
            onClick={onCreateEvent}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvel événement
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* Collapsible Disciplines & Color Coding Panel */}
      {showDisciplinesPanel && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Disciplines sportives & code couleur
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Ajoutez de nouvelles disciplines ou personnalisez la couleur appliquée dans le calendrier, la liste et sur Google Maps.
              </p>
            </div>
          </div>

          {/* Add custom discipline form */}
          <form
            onSubmit={handleAddDiscipline}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-800/50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="new-discipline-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Ajouter une discipline *
                </label>
                <input
                  id="new-discipline-name"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.DISCIPLINE_MIN}
                  maxLength={VALIDATION_LIMITS.DISCIPLINE_MAX}
                  value={newDiscName}
                  onChange={(e) => setNewDiscName(e.target.value)}
                  placeholder="Ex. CrossFit, Yoga Vinyasa, Boxe anglaise..."
                  className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <button
                type="submit"
                disabled={discBusy}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 shrink-0 cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {discBusy ? 'Ajout...' : 'Ajouter la discipline'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Code couleur :
              </span>
              {DISCIPLINE_COLOR_KEYS.map((key) => {
                const preset = DISCIPLINE_COLOR_PRESETS[key];
                const selected = newDiscColor === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewDiscColor(key)}
                    title={preset.label}
                    aria-label={`Choisir la couleur ${preset.label}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-transform ${preset.swatchBg} ${
                      selected
                        ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900 scale-105'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            {discFeedback && (
              <p
                className={`text-xs font-medium ${
                  discFeedback.type === 'success'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {discFeedback.text}
              </p>
            )}
          </form>

          {/* Disciplines alphabetical list */}
          {disciplines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              Aucune discipline enregistrée pour le moment. Ajoutez votre première discipline ci-dessus.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Liste des disciplines (ordre alphabétique) :
              </p>
              <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {disciplines.map((item) => {
                  const preset = DISCIPLINE_COLOR_PRESETS[item.colorKey];
                  const isConfirming = confirmDeleteDiscId === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`flex flex-col gap-3 border-l-4 p-3.5 sm:flex-row sm:items-center sm:justify-between ${preset.leftBorder}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`h-3.5 w-3.5 shrink-0 rounded-sm ${preset.swatchBg}`}
                          aria-hidden="true"
                        />
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {DISCIPLINE_COLOR_KEYS.map((key) => {
                            const c = DISCIPLINE_COLOR_PRESETS[key];
                            const active = item.colorKey === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  void updateCustomDisciplineColor({
                                    name: item.name,
                                    slug: item.id,
                                    colorKey: key,
                                    coachUid,
                                  })
                                }
                                title={`Appliquer ${c.label} à ${item.name}`}
                                aria-label={`Couleur ${c.label} pour ${item.name}`}
                                className={`h-5 w-5 rounded-sm cursor-pointer ${c.swatchBg} ${
                                  active
                                    ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-slate-100 dark:ring-offset-slate-900'
                                    : 'opacity-55 hover:opacity-100'
                                }`}
                              />
                            );
                          })}
                        </div>

                        {isConfirming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteCustomDiscipline(item.id);
                                setConfirmDeleteDiscId(null);
                              }}
                              className="min-h-[32px] rounded-md bg-rose-600 px-2.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDiscId(null)}
                              className="min-h-[32px] rounded-md border border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDiscId(item.id)}
                            title={`Supprimer ${item.name}`}
                            aria-label={`Supprimer la discipline ${item.name}`}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Supprimer
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {isCoachAdmin && pendingCoachRequestsCount > 0 && onOpenCoachesAdmin && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-sm text-amber-950 dark:text-amber-100">
            <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <span>
              <strong>
                {pendingCoachRequestsCount} demande
                {pendingCoachRequestsCount > 1 ? 's' : ''} en attente
              </strong>{' '}
              de validation administrateur (accès coach ou nomination).
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenCoachesAdmin}
            className="min-h-[40px] rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Examiner les demandes
          </button>
        </div>
      )}

      {eventActionFeedback && (
        <div
          role="status"
          className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
            eventActionFeedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200'
          }`}
        >
          <span>{eventActionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setEventActionFeedback(null)}
            className="shrink-0 font-semibold underline cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Content */}
      {events.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900 sm:p-12">
          <CalendarPlus className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h3 className="mt-3 font-display text-lg font-bold text-slate-900 dark:text-white">
            Aucun événement sportif programmé
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            Créez votre première séance sportive ou générez un planning d’exemple incluant une séance dans 42 minutes pour tester la clôture automatique H-1.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onCreateEvent}
              className="min-h-[44px] rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white cursor-pointer"
            >
              + Créer ma première séance
            </button>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
            >
              {seeding ? 'Création en cours...' : 'Générer 5 séances d’exemple'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List (< md) */}
          <div className="mt-5 space-y-3 md:hidden">
            {events.map((ev) => {
              const evalInfo = evaluateEventBooking(ev, nowMs);
              const discStyle = getDisciplineStyle(ev.discipline, disciplines);
              const regCount = registrations.filter(
                (r) => r.eventId === ev.id && r.status === 'confirmed'
              ).length;
              const presentCount = registrations.filter(
                (r) =>
                  r.eventId === ev.id &&
                  r.status === 'confirmed' &&
                  r.attended
              ).length;

              return (
                <div
                  key={ev.id}
                  className={`rounded-xl border border-slate-200 border-l-4 ${discStyle.leftBorder} bg-white p-4 dark:border-slate-800 dark:bg-slate-900`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold capitalize text-slate-500 dark:text-slate-400">
                        {formatFrenchDateShort(ev.startAt.toDate())} ·{' '}
                        <span className="font-mono tabular-nums">
                          {formatTimeRange(
                            ev.startAt.toDate(),
                            ev.durationMinutes
                          )}
                        </span>
                      </p>
                      <h3 className="mt-1 font-display text-base font-bold text-slate-900 dark:text-white">
                        {ev.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                        >
                          <span
                            className={`h-2 w-2 rounded-sm ${discStyle.swatchBg}`}
                            aria-hidden="true"
                          />
                          {ev.discipline}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {ev.durationMinutes} min
                        </span>
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                            ev.isPaid
                              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {formatEventPrice(ev)}
                        </span>
                      </div>
                      {ev.isPaid && (
                        <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatPaymentModeLabel(ev.paymentMode)} · Encaissé :{' '}
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {formatPriceEuros(getCollectedCents(ev.id))}
                          </span>
                        </p>
                      )}
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                        <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        <span>{formatEventCoachesLabel(ev)}</span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        evalInfo.state === 'open'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : evalInfo.state === 'cutoff_closed'
                            ? 'text-amber-700 dark:text-amber-400'
                            : evalInfo.state === 'full' ||
                                evalInfo.state === 'cancelled'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {evalInfo.statusLabel}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <span className="truncate">
                        {ev.city ? `${ev.city}${ev.region ? ` (${ev.region})` : ''} — ` : ''}
                        {ev.location}
                      </span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {formatCapacityCompact(ev)}
                      {regCount > 0 && ` (${presentCount} prés.)`}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRoster(ev)}
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Inscrits ({ev.registeredCount})
                    </button>

                    <button
                      type="button"
                      onClick={() => onDuplicateEvent(ev)}
                      title="Dupliquer sur une autre date"
                      aria-label={`Dupliquer ${ev.title}`}
                      className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditEvent(ev)}
                      aria-label={`Modifier ${ev.title}`}
                      className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {confirmDeleteId === ev.id ? (
                      <div className="flex w-full flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-900/70 dark:bg-rose-950/40">
                        <p className="text-xs text-rose-950 dark:text-rose-100">
                          Supprimer cette séance ?{' '}
                          {regCount > 0
                            ? `${regCount} adhérent${regCount > 1 ? 's inscrits recevront' : ' inscrit recevra'} une notification.`
                            : 'Aucun inscrit à notifier.'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={actionBusyId === ev.id}
                            onClick={() => void handleConfirmDelete(ev)}
                            className="min-h-[38px] flex-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                          >
                            {actionBusyId === ev.id
                              ? 'Suppression...'
                              : regCount > 0
                                ? 'Supprimer & notifier'
                                : 'Confirmer la suppression'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId === ev.id}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                          >
                            Non
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(ev.id)}
                        title="Supprimer la séance et notifier les inscrits"
                        aria-label={`Supprimer ${ev.title} et notifier les inscrits`}
                        className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="mt-6 hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Date & Horaire</th>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5">Séance & Discipline</th>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5">Ville & Lieu</th>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Inscrits</th>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5 whitespace-nowrap">Statut</th>
                    <th className="px-3 py-3 lg:px-4 lg:py-3.5 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {events.map((ev) => {
                    const evalInfo = evaluateEventBooking(ev, nowMs);
                    const discStyle = getDisciplineStyle(ev.discipline, disciplines);
                    const regCount = registrations.filter(
                      (r) => r.eventId === ev.id && r.status === 'confirmed'
                    ).length;
                    const presentCount = registrations.filter(
                      (r) =>
                        r.eventId === ev.id &&
                        r.status === 'confirmed' &&
                        r.attended
                    ).length;

                    return (
                      <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top whitespace-nowrap">
                          <p className="font-medium capitalize text-slate-900 dark:text-white">
                            {formatFrenchDateShort(ev.startAt.toDate())}
                          </p>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatTimeRange(
                              ev.startAt.toDate(),
                              ev.durationMinutes
                            )}
                          </p>
                        </td>

                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top min-w-[200px]">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {ev.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${discStyle.softBg} ${discStyle.border} ${discStyle.text}`}
                            >
                              <span
                                className={`h-2 w-2 rounded-sm ${discStyle.swatchBg}`}
                                aria-hidden="true"
                              />
                              {ev.discipline}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {ev.durationMinutes} min
                            </span>
                            <span
                              className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                                ev.isPaid
                                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              }`}
                            >
                              {formatEventPrice(ev)}
                            </span>
                          </div>
                          {ev.isPaid && (
                            <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {formatPaymentModeLabel(ev.paymentMode)} · Encaissé :{' '}
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {formatPriceEuros(getCollectedCents(ev.id))}
                              </span>
                            </p>
                          )}
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                            <span>{formatEventCoachesLabel(ev)}</span>
                          </p>
                        </td>

                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top text-xs text-slate-600 dark:text-slate-300 max-w-[160px] lg:max-w-[210px]">
                          {ev.city && (
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {ev.city}{ev.region ? ` · ${ev.region}` : ''}
                            </p>
                          )}
                          <p className="truncate">{ev.location}</p>
                        </td>

                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top text-right font-mono tabular-nums whitespace-nowrap">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {formatCapacityCompact(ev)}
                          </p>
                          {regCount > 0 && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {presentCount} présent{presentCount > 1 ? 's' : ''}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top whitespace-nowrap">
                          <span
                            className={`text-xs font-semibold ${
                              evalInfo.state === 'open'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : evalInfo.state === 'cutoff_closed'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : evalInfo.state === 'full' ||
                                      evalInfo.state === 'cancelled'
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {evalInfo.statusLabel}
                          </span>
                        </td>

                        <td className="px-3 py-3 lg:px-4 lg:py-3.5 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-1.5 xl:flex-nowrap">
                            <button
                              type="button"
                              onClick={() => onOpenRoster(ev)}
                              className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                            >
                              <Users className="h-3.5 w-3.5" aria-hidden="true" />
                              Inscrits
                            </button>

                            <button
                              type="button"
                              onClick={() => onDuplicateEvent(ev)}
                              title="Dupliquer sur une autre date"
                              aria-label={`Dupliquer ${ev.title}`}
                              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onEditEvent(ev)}
                              title="Modifier"
                              aria-label={`Modifier ${ev.title}`}
                              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>

                            {confirmDeleteId === ev.id ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  disabled={actionBusyId === ev.id}
                                  onClick={() => void handleConfirmDelete(ev)}
                                  title={
                                    regCount > 0
                                      ? `Supprimer la séance et notifier les ${regCount} inscrit(s)`
                                      : 'Supprimer la séance'
                                  }
                                  className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                                >
                                  {actionBusyId === ev.id
                                    ? 'Envoi...'
                                    : regCount > 0
                                      ? `Suppr. (${regCount} notif.)`
                                      : 'Suppr.'}
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusyId === ev.id}
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="min-h-[34px] rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300 whitespace-nowrap cursor-pointer"
                                >
                                  Non
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(ev.id)}
                                title="Supprimer la séance et notifier les inscrits"
                                aria-label={`Supprimer ${ev.title} et notifier les inscrits`}
                                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
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
          </div>
        </>
      )}
    </section>
  );
}
