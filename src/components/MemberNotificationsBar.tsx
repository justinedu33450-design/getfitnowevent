import { useState } from 'react';
import {
  Ban,
  BellRing,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  Trash2,
  X,
} from 'lucide-react';
import { MemberNotification } from '../types';
import {
  formatFrenchDateShort,
  formatFrenchTime,
} from '../utils/dateAndValidation';

interface MemberNotificationsBarProps {
  notifications: MemberNotification[];
  panelOpen: boolean;
  onClosePanel: () => void;
  onValidateSession: (registrationId: string) => Promise<void>;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onDelete: (notificationId: string) => void;
  onOpenMyTracking: () => void;
}

export function MemberNotificationsBar({
  notifications,
  panelOpen,
  onClosePanel,
  onValidateSession,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onOpenMyTracking,
}: MemberNotificationsBarProps) {
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const unread = notifications.filter((n) =>
    n.type === 'event_cancelled' ? !n.read : !n.read && !n.validated
  );
  const unreadCancelled = notifications.filter(
    (n) => n.type === 'event_cancelled' && !n.read
  );
  const unvalidated = notifications.filter(
    (n) => n.type !== 'event_cancelled' && !n.validated
  );
  const itemsToShow = panelOpen ? notifications : unread;

  if (itemsToShow.length === 0 && !panelOpen) {
    return null;
  }

  const isCancellationAlert = unreadCancelled.length > 0 && unvalidated.length === 0;

  const handleValidate = async (notif: MemberNotification) => {
    setErrorMsg(null);
    setValidatingId(notif.id);
    try {
      await onValidateSession(notif.registrationId);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Impossible de valider cette séance pour le moment.'
      );
    } finally {
      setValidatingId(null);
    }
  };

  let headerTitle = 'Notifications adhérent';
  let headerSubtitle =
    'Retrouvez les annulations de séances et vos rappels de validation.';

  if (unreadCancelled.length > 0 && unvalidated.length > 0) {
    headerTitle = `${unreadCancelled.length} annulation${unreadCancelled.length > 1 ? 's' : ''} et ${unvalidated.length} séance${unvalidated.length > 1 ? 's' : ''} à valider`;
    headerSubtitle =
      'Un événement auquel vous étiez inscrit a été annulé et des séances terminées attendent votre validation.';
  } else if (unreadCancelled.length > 0) {
    headerTitle =
      unreadCancelled.length === 1
        ? 'Séance annulée par l’animateur'
        : `${unreadCancelled.length} séances annulées par l’animateur`;
    headerSubtitle =
      'Votre inscription a été annulée automatiquement (et remboursée si la séance était payante).';
  } else if (unvalidated.length > 0) {
    headerTitle =
      unvalidated.length === 1
        ? 'Séance terminée : pensez à valider votre séance'
        : `${unvalidated.length} séances terminées à valider`;
    headerSubtitle =
      'Confirmez votre participation dès la fin de votre séance pour mettre à jour votre suivi.';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b ${
        isCancellationAlert
          ? 'border-rose-200 bg-rose-50/90 dark:border-rose-900/70 dark:bg-rose-950/40'
          : 'border-amber-200 bg-amber-50/90 dark:border-amber-900/70 dark:bg-amber-950/40'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                isCancellationAlert
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/70 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-300'
              }`}
            >
              {isCancellationAlert ? (
                <Ban className="h-4 w-4" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`font-display text-sm font-bold ${
                  isCancellationAlert
                    ? 'text-rose-950 dark:text-rose-100'
                    : 'text-amber-950 dark:text-amber-100'
                }`}
              >
                {headerTitle}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  isCancellationAlert
                    ? 'text-rose-900/85 dark:text-rose-200/85'
                    : 'text-amber-900/80 dark:text-amber-200/85'
                }`}
              >
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenMyTracking}
              className={`inline-flex min-h-[36px] items-center rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold dark:bg-slate-900 whitespace-nowrap cursor-pointer ${
                isCancellationAlert
                  ? 'border-rose-200 text-rose-950 hover:bg-rose-100/60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40'
                  : 'border-amber-200 text-amber-950 hover:bg-amber-100/60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40'
              }`}
            >
              Voir mon suivi
            </button>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold dark:bg-slate-900 whitespace-nowrap cursor-pointer ${
                  isCancellationAlert
                    ? 'border-rose-200 text-rose-950 hover:bg-rose-100/60 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/40'
                    : 'border-amber-200 text-amber-950 hover:bg-amber-100/60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40'
                }`}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Tout marquer comme lu
              </button>
            )}
            {panelOpen && (
              <button
                type="button"
                onClick={onClosePanel}
                aria-label="Fermer le panneau des notifications"
                className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
            {errorMsg}
          </div>
        )}

        {itemsToShow.length === 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Aucune notification pour le moment.
          </div>
        ) : (
          <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-0.5">
            {itemsToShow.map((notif) => {
              const startDate = notif.eventStartAt.toDate();
              const endDate = notif.eventEndAt.toDate();
              const isBusy = validatingId === notif.id;
              const isCancelledNotif = notif.type === 'event_cancelled';

              return (
                <div
                  key={notif.id}
                  className={`flex flex-col gap-2.5 rounded-lg border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
                    isCancelledNotif
                      ? notif.read
                        ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                        : 'border-rose-300 bg-white shadow-2xs dark:border-rose-700/70 dark:bg-slate-900'
                      : notif.validated || notif.read
                        ? 'border-slate-200 bg-white/85 dark:border-slate-800 dark:bg-slate-900/80'
                        : 'border-amber-300 bg-white shadow-2xs dark:border-amber-700/70 dark:bg-slate-900'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isCancelledNotif ? (
                        <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          <Ban className="h-3 w-3" aria-hidden="true" />
                          Séance annulée
                        </span>
                      ) : notif.validated ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Séance validée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          À valider
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {notif.eventTitle}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums capitalize">
                        <CalendarClock
                          className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500"
                          aria-hidden="true"
                        />
                        {formatFrenchDateShort(startDate)} ·{' '}
                        {formatFrenchTime(startDate)} –{' '}
                        {formatFrenchTime(endDate)}
                      </span>
                      {isCancelledNotif ? (
                        <span className="text-rose-800 dark:text-rose-300 font-medium">
                          Annulée par l’animateur
                          {notif.coachName ? ` (${notif.coachName})` : ''} · Votre
                          inscription a été annulée
                          {notif.wasPaid
                            ? ' et le remboursement a été enregistré.'
                            : '.'}
                        </span>
                      ) : (
                        !notif.validated && (
                          <span className="text-amber-800 dark:text-amber-300 font-medium">
                            Pensez à valider la séance que vous venez d’effectuer.
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isCancelledNotif && !notif.validated && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleValidate(notif)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {isBusy ? 'Validation...' : 'Valider ma séance'}
                      </button>
                    )}

                    {isCancelledNotif && !notif.read && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notif.id)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:bg-slate-800 dark:text-rose-300 dark:hover:bg-rose-950/50 whitespace-nowrap cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Marquer comme lu
                      </button>
                    )}

                    {!isCancelledNotif && !notif.read && !notif.validated && (
                      <button
                        type="button"
                        onClick={() => onMarkRead(notif.id)}
                        title="Marquer comme lu"
                        aria-label={`Marquer comme lue la notification pour ${notif.eventTitle}`}
                        className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDelete(notif.id)}
                      title="Supprimer la notification"
                      aria-label={`Supprimer la notification pour ${notif.eventTitle}`}
                      className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-800 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
