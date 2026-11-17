import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Download,
  LogOut,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { BOOTSTRAPPED_COACH_EMAIL } from '../firebase';
import {
  CoachAdminUser,
  FitnessLevel,
  FollowUpStatus,
  MemberAggregate,
  MemberProfile,
  Registration,
  SportEvent,
  VALIDATION_LIMITS,
} from '../types';
import {
  createManualMember,
  deleteMemberCompletely,
  toggleRegistrationAttendance,
  upsertMemberProfile,
} from '../services/firestoreService';
import {
  FITNESS_LEVEL_OPTIONS,
  calculateAgeFromBirthDate,
  exportCsv,
  formatBirthDateFrench,
  formatFitnessLevelLabel,
  formatFrenchDateShort,
  formatFrenchTime,
  toLocalDateInputValue,
} from '../utils/dateAndValidation';
import { PhotoUploadField, ProfileAvatar } from './ProfileAvatar';
import { MemberRegularityChart } from './MemberRegularityChart';

interface MembersTrackingViewProps {
  coachEmail: string;
  coachAdmins?: CoachAdminUser[];
  events: SportEvent[];
  registrations: Registration[];
  memberProfiles: MemberProfile[];
  nowMs: number;
  onSignOut: () => void;
}

const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  active: 'Actif',
  to_follow_up: 'À relancer',
  paused: 'En pause',
};

export function MembersTrackingView({
  coachEmail,
  coachAdmins = [],
  events,
  registrations,
  memberProfiles,
  nowMs,
  onSignOut,
}: MembersTrackingViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FollowUpStatus>('all');
  const [selectedMemberKey, setSelectedMemberKey] = useState<string | null>(
    null
  );
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const coachIdentitySets = useMemo(() => {
    const emails = new Set<string>([
      BOOTSTRAPPED_COACH_EMAIL.trim().toLowerCase(),
    ]);
    const emailKeys = new Set<string>();
    if (coachEmail.trim()) {
      emails.add(coachEmail.trim().toLowerCase());
    }
    coachAdmins.forEach((a) => {
      if (a.email?.trim()) emails.add(a.email.trim().toLowerCase());
      if (a.emailKey?.trim()) emailKeys.add(a.emailKey.trim());
    });
    return { emails, emailKeys };
  }, [coachAdmins, coachEmail]);

  // Aggregate unique members from registrations + saved profiles (excluding coaches)
  const members = useMemo<MemberAggregate[]>(() => {
    const profileMap = new Map<string, MemberProfile>();
    memberProfiles.forEach((p) => {
      const cleanEmail = (p.email ?? '').trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(p.emailKey) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      profileMap.set(p.emailKey, p);
    });

    const grouped = new Map<string, Registration[]>();
    registrations.forEach((reg) => {
      if (reg.status !== 'confirmed') return;
      const cleanEmail = (reg.email ?? '').trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(reg.emailKey) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      const list = grouped.get(reg.emailKey) ?? [];
      list.push(reg);
      grouped.set(reg.emailKey, list);
    });

    const allKeys = new Set<string>([
      ...profileMap.keys(),
      ...grouped.keys(),
    ]);

    const result: MemberAggregate[] = [];
    allKeys.forEach((key) => {
      const profile = profileMap.get(key) ?? null;
      const regs = (grouped.get(key) ?? []).slice().sort(
        (a, b) => b.eventStartAt.toMillis() - a.eventStartAt.toMillis()
      );
      const latestReg = regs[0];
      const email = profile?.email || latestReg?.email || '';
      const cleanEmail = email.trim().toLowerCase();
      if (
        coachIdentitySets.emailKeys.has(key) ||
        (cleanEmail && coachIdentitySets.emails.has(cleanEmail))
      ) {
        return;
      }
      const firstName = profile?.firstName || latestReg?.firstName || '';
      const lastName = profile?.lastName || latestReg?.lastName || '';

      const pastRegs = regs.filter((r) => r.eventStartAt.toMillis() <= nowMs);
      const upcomingRegs = regs.filter((r) => r.eventStartAt.toMillis() > nowMs);
      const attendedCount = regs.filter((r) => r.attended).length;

      const attendanceRate =
        pastRegs.length > 0
          ? Math.round((attendedCount / pastRegs.length) * 100)
          : null;

      const lastSession = pastRegs[0]?.eventStartAt.toDate() ?? null;
      const nextSession =
        upcomingRegs[upcomingRegs.length - 1]?.eventStartAt.toDate() ?? null;

      result.push({
        emailKey: key,
        email,
        firstName,
        lastName,
        profile,
        registrations: regs,
        totalRegistrations: regs.length,
        attendedCount,
        pastRegistrationsCount: pastRegs.length,
        upcomingRegistrationsCount: upcomingRegs.length,
        attendanceRate,
        lastSessionDate: lastSession,
        nextSessionDate: nextSession,
      });
    });

    return result.sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(
        `${b.lastName} ${b.firstName}`,
        'fr'
      )
    );
  }, [registrations, memberProfiles, coachIdentitySets, nowMs]);

  const existingEmailKeys = useMemo(
    () => new Set(members.map((m) => m.emailKey)),
    [members]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const currentStatus: FollowUpStatus =
        m.profile?.followUpStatus ?? 'active';
      if (statusFilter !== 'all' && currentStatus !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${m.firstName} ${m.lastName} ${m.email} ${m.profile?.goal ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, search, statusFilter]);

  const selectedMember = useMemo(
    () => members.find((m) => m.emailKey === selectedMemberKey) ?? null,
    [members, selectedMemberKey]
  );

  const selectedMemberAllRegistrations = useMemo(() => {
    if (!selectedMember) return [];
    return registrations.filter((r) => r.emailKey === selectedMember.emailKey);
  }, [registrations, selectedMember]);

  const stats = useMemo(() => {
    const total = members.length;
    const toFollowUp = members.filter(
      (m) => m.profile?.followUpStatus === 'to_follow_up'
    ).length;
    const withPast = members.filter((m) => m.attendanceRate !== null);
    const avgAttendance =
      withPast.length > 0
        ? Math.round(
            withPast.reduce((sum, m) => sum + (m.attendanceRate ?? 0), 0) /
              withPast.length
          )
        : null;
    const upcomingTotal = members.reduce(
      (sum, m) => sum + m.upcomingRegistrationsCount,
      0
    );
    return { total, toFollowUp, avgAttendance, upcomingTotal };
  }, [members]);

  const handleDeleteMember = async (member: MemberAggregate) => {
    setFeedback(null);
    setDeletingKey(member.emailKey);
    try {
      await deleteMemberCompletely({
        emailKey: member.emailKey,
        email: member.email,
        registrations,
        events,
      });
      if (selectedMemberKey === member.emailKey) {
        setSelectedMemberKey(null);
      }
      setConfirmDeleteKey(null);
      setFeedback({
        type: 'success',
        text: `Toutes les informations de l’adhérent ${member.firstName} ${member.lastName} ont été supprimées de la base de données. Il pourra se réinscrire ultérieurement.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de supprimer cet adhérent.',
      });
    } finally {
      setDeletingKey(null);
    }
  };

  const handleExportMembers = () => {
    exportCsv(
      'suivi-adherents.csv',
      [
        'Nom',
        'Prénom',
        'Email',
        'Téléphone',
        'Date de naissance',
        'Âge',
        'Niveau sportif',
        'Statut suivi',
        'Objectif',
        'Total séances',
        'Présences',
        'Notes',
      ],
      filteredMembers.map((m) => {
        const age = calculateAgeFromBirthDate(m.profile?.birthDate);
        return [
          m.lastName,
          m.firstName,
          m.email,
          m.profile?.phone ?? '',
          formatBirthDateFrench(m.profile?.birthDate),
          age !== null ? `${age} ans` : '',
          formatFitnessLevelLabel(m.profile?.fitnessLevel),
          FOLLOW_UP_LABELS[m.profile?.followUpStatus ?? 'active'],
          m.profile?.goal ?? '',
          String(m.totalRegistrations),
          String(m.attendedCount),
          m.profile?.notes ?? '',
        ];
      })
    );
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            Suivi des adhérents
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Répertoire des participants ({coachEmail}) · Ajoutez, suivez ou supprimez des fiches adhérents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un adhérent
          </button>

          <button
            type="button"
            onClick={handleExportMembers}
            disabled={filteredMembers.length === 0}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exporter CSV
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </div>

      {/* 4-Column Summary Strip */}
      <div className="mt-6 grid grid-cols-2 divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Adhérents enregistrés
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.total}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Réservations à venir
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.upcomingTotal}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Assiduité moyenne
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
            {stats.avgAttendance !== null ? `${stats.avgAttendance}%` : '—'}
          </p>
        </div>
        <div className="p-4 sm:px-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Profils à relancer
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
            {stats.toFollowUp}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-5 rounded-xl border p-3.5 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Search + Status Filter */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Filtrer par statut de suivi"
          className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1"
        >
          {(
            [
              { id: 'all', label: 'Tous' },
              { id: 'active', label: 'Actifs' },
              { id: 'to_follow_up', label: 'À relancer' },
              { id: 'paused', label: 'En pause' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[32px] rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, email, objectif..."
            aria-label="Rechercher un adhérent"
            className="min-h-[40px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>
      </div>

      {/* Members Table / Mobile Cards */}
      {filteredMembers.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center sm:p-12">
          <UserCheck className="mx-auto h-9 w-9 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h3 className="mt-3 font-display text-base font-bold text-slate-900 dark:text-white">
            Aucun adhérent trouvé
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ajoutez un adhérent manuellement ou attendez qu’un participant s’inscrive à une séance via le calendrier.
          </p>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Ajouter un adhérent
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Member Cards (< md) */}
          <div className="mt-5 space-y-3 md:hidden">
            {filteredMembers.map((member) => {
              const followStatus: FollowUpStatus =
                member.profile?.followUpStatus ?? 'active';
              const memberAge = calculateAgeFromBirthDate(member.profile?.birthDate);
              const memberLevelShort = formatFitnessLevelLabel(
                member.profile?.fitnessLevel,
                true
              );

              return (
                <div
                  key={member.emailKey}
                  onClick={() => setSelectedMemberKey(member.emailKey)}
                  className="cursor-pointer rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 active:bg-slate-50 dark:active:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <ProfileAvatar
                        name={`${member.firstName} ${member.lastName}`}
                        photoUrl={member.profile?.photoUrl}
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                          {member.firstName} {member.lastName}
                          {memberAge !== null && (
                            <span className="ml-1.5 font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                              · {memberAge} ans
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {member.email}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        followStatus === 'active'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : followStatus === 'to_follow_up'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {FOLLOW_UP_LABELS[followStatus]}
                    </span>
                  </div>

                  {(memberLevelShort || member.profile?.goal) && (
                    <div className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                      {memberLevelShort && (
                        <p className="font-medium text-emerald-700 dark:text-emerald-400">
                          Niveau : {memberLevelShort}
                        </p>
                      )}
                      {member.profile?.goal && (
                        <p className="truncate">
                          Objectif : {member.profile.goal}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-mono tabular-nums">
                      {member.totalRegistrations} séances · {member.attendedCount}{' '}
                      prés.
                      {member.attendanceRate !== null &&
                        ` (${member.attendanceRate}%)`}
                    </span>

                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedMemberKey(member.emailKey)}
                        className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                      >
                        Fiche
                      </button>

                      {confirmDeleteKey === member.emailKey ? (
                        <>
                          <button
                            type="button"
                            disabled={deletingKey === member.emailKey}
                            onClick={() => void handleDeleteMember(member)}
                            className="min-h-[38px] rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                          >
                            Suppr.
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteKey(null)}
                            className="min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            Non
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(member.emailKey)}
                          aria-label={`Supprimer ${member.firstName} ${member.lastName}`}
                          className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="mt-5 hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3.5">Adhérent</th>
                    <th className="px-4 py-3.5">Âge & Niveau</th>
                    <th className="px-4 py-3.5">Objectif</th>
                    <th className="px-4 py-3.5 text-right">Réservations</th>
                    <th className="px-4 py-3.5 text-right">Présences</th>
                    <th className="px-4 py-3.5">Prochaine / Dernière séance</th>
                    <th className="px-4 py-3.5">Suivi</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredMembers.map((member) => {
                    const followStatus: FollowUpStatus =
                      member.profile?.followUpStatus ?? 'active';
                    const memberAge = calculateAgeFromBirthDate(
                      member.profile?.birthDate
                    );
                    const memberLevelShort = formatFitnessLevelLabel(
                      member.profile?.fitnessLevel,
                      true
                    );

                    return (
                      <tr
                        key={member.emailKey}
                        onClick={() => setSelectedMemberKey(member.emailKey)}
                        className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar
                              name={`${member.firstName} ${member.lastName}`}
                              photoUrl={member.profile?.photoUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {member.firstName} {member.lastName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <div className="space-y-0.5">
                            <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                              {memberAge !== null ? `${memberAge} ans` : 'Âge —'}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                              {memberLevelShort || 'Niveau non renseigné'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[180px] truncate">
                          {member.profile?.goal || 'Non renseigné'}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {member.totalRegistrations}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                          {member.attendedCount}
                          {member.attendanceRate !== null && (
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                              ({member.attendanceRate}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {member.nextSessionDate ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400 capitalize">
                              À venir : {formatFrenchDateShort(member.nextSessionDate)}
                            </span>
                          ) : member.lastSessionDate ? (
                            <span className="capitalize">
                              Dernière : {formatFrenchDateShort(member.lastSessionDate)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`text-xs font-semibold ${
                              followStatus === 'active'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : followStatus === 'to_follow_up'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {FOLLOW_UP_LABELS[followStatus]}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedMemberKey(member.emailKey)}
                              className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Ouvrir
                            </button>

                            {confirmDeleteKey === member.emailKey ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={deletingKey === member.emailKey}
                                  onClick={() => void handleDeleteMember(member)}
                                  className="min-h-[34px] rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  Suppr.
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteKey(null)}
                                  className="min-h-[34px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  Non
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteKey(member.emailKey)}
                                title="Supprimer cet adhérent"
                                aria-label={`Supprimer ${member.firstName} ${member.lastName}`}
                                className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-rose-200 dark:hover:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-300 cursor-pointer"
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

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <AddMemberModal
          existingEmailKeys={existingEmailKeys}
          coachEmails={coachIdentitySets.emails}
          onClose={() => setIsAddModalOpen(false)}
          onCreated={(emailKey, fullName) => {
            setIsAddModalOpen(false);
            setSelectedMemberKey(emailKey);
            setFeedback({
              type: 'success',
              text: `L’adhérent ${fullName} a été ajouté au répertoire.`,
            });
          }}
        />
      )}

      {/* Member Detail & Coaching Follow-up Drawer */}
      {selectedMember && (
        <MemberDetailDrawer
          key={selectedMember.emailKey}
          member={selectedMember}
          allRegistrations={selectedMemberAllRegistrations}
          events={events}
          nowMs={nowMs}
          deleting={deletingKey === selectedMember.emailKey}
          onDelete={() => void handleDeleteMember(selectedMember)}
          onClose={() => setSelectedMemberKey(null)}
        />
      )}
    </section>
  );
}

interface AddMemberModalProps {
  existingEmailKeys: Set<string>;
  coachEmails: Set<string>;
  onClose: () => void;
  onCreated: (emailKey: string, fullName: string) => void;
}

function AddMemberModal({
  existingEmailKeys,
  coachEmails,
  onClose,
  onCreated,
}: AddMemberModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | ''>('');
  const [goal, setGoal] = useState('');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>('active');
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayIso = useMemo(() => toLocalDateInputValue(new Date()), []);
  const computedAge = useMemo(
    () => calculateAgeFromBirthDate(birthDate),
    [birthDate]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && coachEmails.has(cleanEmail)) {
      setError(
        'Cette adresse email appartient à un coach de l’application. Les coachs sont gérés séparément dans l’onglet Coachs.'
      );
      return;
    }
    setSaving(true);
    try {
      const emailKey = await createManualMember({
        firstName,
        lastName,
        email,
        phone,
        goal,
        birthDate,
        fitnessLevel,
        notes,
        followUpStatus,
        photoUrl,
        existingEmailKeys,
      });
      onCreated(emailKey, `${firstName.trim()} ${lastName.trim()}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’ajouter cet adhérent.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6">
          <div>
            <h2
              id="add-member-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
            >
              Ajouter un adhérent
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Créez manuellement une fiche adhérent dans votre suivi coaching.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6"
        >
          <PhotoUploadField
            label="Photo de profil de l’adhérent"
            name={`${firstName} ${lastName}`.trim() || 'Adhérent'}
            photoUrl={photoUrl}
            onChange={setPhotoUrl}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-member-firstname"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Prénom *
              </label>
              <input
                id="add-member-firstname"
                type="text"
                required
                minLength={VALIDATION_LIMITS.FIRST_NAME_MIN}
                maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex. Camille"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="add-member-lastname"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Nom *
              </label>
              <input
                id="add-member-lastname"
                type="text"
                required
                minLength={VALIDATION_LIMITS.LAST_NAME_MIN}
                maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ex. Durand"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="add-member-email"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Adresse email *
            </label>
            <input
              id="add-member-email"
              type="email"
              required
              maxLength={VALIDATION_LIMITS.EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="camille.durand@exemple.fr"
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="add-member-phone"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Téléphone
              </label>
              <input
                id="add-member-phone"
                type="tel"
                maxLength={VALIDATION_LIMITS.PHONE_MAX}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="add-member-status"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Statut de suivi
              </label>
              <select
                id="add-member-status"
                value={followUpStatus}
                onChange={(e) =>
                  setFollowUpStatus(e.target.value as FollowUpStatus)
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="active">Actif</option>
                <option value="to_follow_up">À relancer</option>
                <option value="paused">En pause</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <label
                htmlFor="add-member-birthdate"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Date de naissance
              </label>
              <input
                id="add-member-birthdate"
                type="date"
                min="1900-01-01"
                max={todayIso}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="sm:col-span-4">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Âge (auto)
              </span>
              <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                {computedAge !== null ? `${computedAge} ans` : '—'}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="add-member-fitness-level"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Niveau sportif
            </label>
            <select
              id="add-member-fitness-level"
              value={fitnessLevel}
              onChange={(e) =>
                setFitnessLevel(e.target.value as FitnessLevel | '')
              }
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">Sélectionner un niveau</option>
              {FITNESS_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="add-member-goal"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Objectif sportif
            </label>
            <input
              id="add-member-goal"
              type="text"
              maxLength={VALIDATION_LIMITS.GOAL_MAX}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex. Remise en forme, endurance..."
              className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="add-member-notes"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Notes de coaching
            </label>
            <textarea
              id="add-member-notes"
              rows={3}
              maxLength={VALIDATION_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Antécédents, préférences, disponibilités..."
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Création...' : 'Créer la fiche adhérent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MemberDetailDrawerProps {
  member: MemberAggregate;
  allRegistrations: Registration[];
  events: SportEvent[];
  nowMs: number;
  deleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

function MemberDetailDrawer({
  member,
  allRegistrations,
  events,
  nowMs,
  deleting,
  onDelete,
  onClose,
}: MemberDetailDrawerProps) {
  const [firstName, setFirstName] = useState(member.firstName);
  const [lastName, setLastName] = useState(member.lastName);
  const [phone, setPhone] = useState(member.profile?.phone ?? '');
  const [birthDate, setBirthDate] = useState(member.profile?.birthDate ?? '');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel | ''>(
    member.profile?.fitnessLevel ?? ''
  );
  const [goal, setGoal] = useState(member.profile?.goal ?? '');
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>(
    member.profile?.followUpStatus ?? 'active'
  );
  const [notes, setNotes] = useState(member.profile?.notes ?? '');
  const [photoUrl, setPhotoUrl] = useState(member.profile?.photoUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setFirstName(member.firstName);
    setLastName(member.lastName);
    setPhone(member.profile?.phone ?? '');
    setBirthDate(member.profile?.birthDate ?? '');
    setFitnessLevel(member.profile?.fitnessLevel ?? '');
    setGoal(member.profile?.goal ?? '');
    setFollowUpStatus(member.profile?.followUpStatus ?? 'active');
    setNotes(member.profile?.notes ?? '');
    setPhotoUrl(member.profile?.photoUrl ?? '');
  }, [
    member.emailKey,
    member.firstName,
    member.lastName,
    member.profile?.phone,
    member.profile?.birthDate,
    member.profile?.fitnessLevel,
    member.profile?.goal,
    member.profile?.followUpStatus,
    member.profile?.notes,
    member.profile?.photoUrl,
  ]);

  const todayIso = useMemo(() => toLocalDateInputValue(new Date()), []);
  const computedAge = useMemo(
    () => calculateAgeFromBirthDate(birthDate),
    [birthDate]
  );
  const headerLevelLabel = useMemo(
    () => formatFitnessLevelLabel(fitnessLevel, true),
    [fitnessLevel]
  );

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    setSaveError(null);
    try {
      await upsertMemberProfile({
        emailKey: member.emailKey,
        email: member.email,
        firstName: firstName.trim() || member.firstName,
        lastName: lastName.trim() || member.lastName,
        phone,
        goal,
        birthDate,
        fitnessLevel,
        notes,
        followUpStatus,
        photoUrl,
        exists: Boolean(member.profile),
      });
      setSavedNotice(true);
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer la fiche de suivi.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-drawer-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 dark:bg-slate-950/75 backdrop-blur-xs sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        className="flex h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl sm:h-full sm:rounded-none sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <ProfileAvatar
              name={`${member.firstName} ${member.lastName}`}
              photoUrl={photoUrl}
              size="lg"
            />
            <div className="min-w-0">
              <h2
                id="member-drawer-title"
                className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl truncate"
              >
                {member.firstName} {member.lastName}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                {member.email}
                {computedAge !== null ? ` · ${computedAge} ans` : ''}
                {headerLevelLabel ? ` · ${headerLevelLabel}` : ''}
              </p>
              <p className="mt-1.5 font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                {member.totalRegistrations} séance
                {member.totalRegistrations > 1 ? 's' : ''} réservée
                {member.totalRegistrations > 1 ? 's' : ''} · {member.attendedCount}{' '}
                présence{member.attendedCount > 1 ? 's' : ''} confirmée
                {member.attendedCount > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche adhérent"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 sm:p-6">
          {/* Coaching Profile Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Informations & suivi du coach
            </h3>

            <PhotoUploadField
              label="Photo de profil de l’adhérent"
              name={`${firstName} ${lastName}`.trim() || member.email}
              photoUrl={photoUrl}
              onChange={setPhotoUrl}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="member-firstname"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Prénom *
                </label>
                <input
                  id="member-firstname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.FIRST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.FIRST_NAME_MAX}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="member-lastname"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Nom *
                </label>
                <input
                  id="member-lastname"
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.LAST_NAME_MIN}
                  maxLength={VALIDATION_LIMITS.LAST_NAME_MAX}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="member-status"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Statut de suivi
                </label>
                <select
                  id="member-status"
                  value={followUpStatus}
                  onChange={(e) =>
                    setFollowUpStatus(e.target.value as FollowUpStatus)
                  }
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="active">Actif</option>
                  <option value="to_follow_up">À relancer</option>
                  <option value="paused">En pause</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="member-phone"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Téléphone
                </label>
                <input
                  id="member-phone"
                  type="tel"
                  maxLength={VALIDATION_LIMITS.PHONE_MAX}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="06 12 34 56 78"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <label
                  htmlFor="member-birthdate"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Date de naissance
                </label>
                <input
                  id="member-birthdate"
                  type="date"
                  min="1900-01-01"
                  max={todayIso}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-4">
                <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Âge (auto)
                </span>
                <div className="mt-1 flex min-h-[44px] items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  {computedAge !== null ? `${computedAge} ans` : '—'}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="member-fitness-level"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Niveau sportif
              </label>
              <select
                id="member-fitness-level"
                value={fitnessLevel}
                onChange={(e) =>
                  setFitnessLevel(e.target.value as FitnessLevel | '')
                }
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="">Non renseigné</option>
                {FITNESS_LEVEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="member-goal"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Objectif sportif
              </label>
              <input
                id="member-goal"
                type="text"
                maxLength={VALIDATION_LIMITS.GOAL_MAX}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Ex. Remise en forme, préparation semi-marathon..."
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="member-notes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Notes de séance, antécédents & progression
              </label>
              <textarea
                id="member-notes"
                rows={4}
                maxLength={VALIDATION_LIMITS.NOTES_MAX}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Genou gauche sensible, progresse vite sur les kettlebells..."
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {saveError && (
              <p className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs text-rose-800 dark:text-rose-200">
                {saveError}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              {savedNotice ? (
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  Fiche de suivi enregistrée.
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 cursor-pointer"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer le suivi'}
              </button>
            </div>
          </form>

          {/* Regularity Pie Chart (Week / Month / Year) */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <MemberRegularityChart
              registrations={allRegistrations}
              events={events}
              nowMs={nowMs}
              compact
              title="Régularité de l’adhérent"
              subtitle="Événements inscrits, validés et annulés par semaine, mois ou année."
            />

            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Historique des séances ({member.registrations.length})
            </h3>

            {member.registrations.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Aucune séance réservée pour le moment.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {member.registrations.map((reg) => {
                  const startDate = reg.eventStartAt.toDate();
                  const isUpcoming = startDate.getTime() > nowMs;
                  return (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {reg.eventTitle}
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums capitalize">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatFrenchDateShort(startDate)} ·{' '}
                          {formatFrenchTime(startDate)}
                          {isUpcoming && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-sans font-semibold">
                              · À venir
                            </span>
                          )}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void toggleRegistrationAttendance(
                            reg.id,
                            !reg.attended
                          )
                        }
                        className={`inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-md border px-3 py-1 text-xs font-semibold cursor-pointer ${
                          reg.attended
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        {reg.attended ? 'Présent' : 'Pointer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delete Member Section */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/35 p-4">
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Suppression de l’adhérent
              </h4>
              <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                Efface totalement toutes ses données de la base de données (fiche, inscriptions, paiements et notifications). Il pourra se réinscrire ultérieurement comme un nouvel adhérent.
              </p>

              {confirmDelete ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={onDelete}
                    className="min-h-[40px] rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                  >
                    {deleting ? 'Suppression...' : 'Confirmer la suppression'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Supprimer cet adhérent
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
