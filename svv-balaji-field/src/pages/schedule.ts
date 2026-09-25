import dayjs from 'dayjs';
import type { Agreement, Farmer, FieldVisit, FieldVisitPlan, SeedDistribution, TrainingSession } from '@shared/api/types';

/**
 * The Agriculture Expert's day, derived rather than scheduled.
 *
 * -----------------------------------------------------------------------------
 * There is no appointments table in this system, and this does not invent one.
 *
 * Everything below is read off commitments that already exist: a training
 * session someone dated today, an agreement whose harvest date has arrived, a
 * farmer left half-registered. That is honest — each item is a real obligation
 * with a record behind it — and it needs nobody to maintain a calendar.
 *
 * Planned visits (FRD 12.1, `FieldVisitPlan`) are the one exception: an
 * appointment the executive made deliberately. They appear here on the day,
 * and stay as overdue until the visit is recorded or the plan is cancelled.
 * -----------------------------------------------------------------------------
 */

export type ScheduleKind =
  | 'training'
  | 'harvest-due'
  | 'incomplete-farmer'
  | 'unapproved-farmer'
  | 'follow-up'
  | 'planned-visit';

export type Urgency = 'overdue' | 'today' | 'soon';

export interface ScheduleItem {
  key: string;
  kind: ScheduleKind;
  title: string;
  detail: string;
  /** What this becomes if it is dealt with — used for the action button. */
  actionLabel: string;
  actionPath: string;
  urgency: Urgency;
  /** The date this hangs off, for sorting. */
  when: string;
  farmerId?: string;
}

/** How far ahead a harvest counts as "coming up" rather than "later". */
const HARVEST_HORIZON_DAYS = 7;

/** A farmer visited longer ago than this is due another look. */
const FOLLOW_UP_DAYS = 30;

interface BuildInput {
  userId: string | undefined;
  farmers: Farmer[];
  agreements: Agreement[];
  visits: FieldVisit[];
  training: TrainingSession[];
  seed: SeedDistribution[];
  /** Farmer ids that already have an inspection raised, so harvest is handled. */
  inspectedFarmerIds: Set<string>;
  /** Open (PLANNED) visit plans. Optional so older callers keep working. */
  plans?: FieldVisitPlan[];
}

/**
 * `seed` is accepted but not yet read. Seed handouts have no follow-up rule
 * worth surfacing - a handout is complete the moment it is recorded. It stays
 * on the input so the obvious next rule ("distributed seed 90 days ago, no
 * visit since") does not need every caller changed.
 */

export function buildSchedule({
  userId,
  farmers,
  agreements,
  visits,
  training,
  inspectedFarmerIds,
  plans = [],
}: BuildInput): ScheduleItem[] {
  const today = dayjs().startOf('day');
  const items: ScheduleItem[] = [];

  // --- Planned visits: appointments the executive (or their manager) made ----
  const plannedFarmerIds = new Set<string>();
  for (const plan of plans) {
    if (plan.status !== 'PLANNED') continue;
    if (userId && plan.expertId !== userId) continue;
    plannedFarmerIds.add(plan.farmerId);

    const diff = dayjs(plan.plannedDate).startOf('day').diff(today, 'day');
    if (diff > HARVEST_HORIZON_DAYS) continue;

    items.push({
      key: `plan-${plan.id}`,
      kind: 'planned-visit',
      title: `${plan.farmer?.fullName ?? 'Farmer'}${plan.cropName ? ` — ${plan.cropName}` : ''}`,
      detail:
        (diff < 0
          ? `Planned visit ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} ago, not yet recorded.`
          : diff === 0
            ? 'Planned visit today.'
            : `Planned visit in ${diff} day${diff === 1 ? '' : 's'}.`) + (plan.purpose ? ` ${plan.purpose}.` : ''),
      actionLabel: 'Start visit',
      actionPath: '/visits?view=planned',
      urgency: diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'soon',
      when: plan.plannedDate,
      farmerId: plan.farmerId,
    });
  }

  // --- Training sessions: the only genuinely scheduled thing here -----------
  for (const session of training) {
    if (userId && session.conductedById !== userId) continue;
    const date = dayjs(session.scheduledDate).startOf('day');
    const diff = date.diff(today, 'day');
    if (diff < -1 || diff > HARVEST_HORIZON_DAYS) continue;

    items.push({
      key: `training-${session.id}`,
      kind: 'training',
      title: session.title,
      detail:
        diff === 0
          ? `Today · ${session._count?.attendances ?? 0} farmers marked so far`
          : diff < 0
            ? 'Yesterday — attendance not yet recorded?'
            : `In ${diff} day${diff === 1 ? '' : 's'}`,
      actionLabel: 'Open session',
      actionPath: '/more/training',
      urgency: diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'soon',
      when: session.scheduledDate,
    });
  }

  // --- Harvests coming due with no inspection raised ------------------------
  //
  // This is the one that costs money if it slips. An agreement's harvest date
  // arrives, nobody inspects, and procurement cannot collect — the crop sits
  // in the field losing quality while the paperwork catches up.
  for (const agreement of agreements) {
    if (!agreement.harvestDate) continue;
    if (agreement.status === 'COMPLETED' || agreement.status === 'CANCELLED') continue;
    if (inspectedFarmerIds.has(agreement.farmerId)) continue;

    const date = dayjs(agreement.harvestDate).startOf('day');
    const diff = date.diff(today, 'day');
    if (diff > HARVEST_HORIZON_DAYS) continue;

    items.push({
      key: `harvest-${agreement.id}`,
      kind: 'harvest-due',
      title: `${agreement.farmer?.fullName ?? 'Farmer'} — ${agreement.cropName}`,
      detail:
        diff < 0
          ? `Harvest was due ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} ago and has no inspection. Procurement cannot collect until it does.`
          : diff === 0
            ? 'Harvest due today. An approved inspection is what lets procurement collect.'
            : `Harvest due in ${diff} day${diff === 1 ? '' : 's'}.`,
      // Inspections are procurement's (FRD 13.4); the expert's part is to make
      // sure procurement knows the crop is ready.
      actionLabel: 'Open farmer',
      actionPath: '/farmers',
      urgency: diff < 0 ? 'overdue' : diff === 0 ? 'today' : 'soon',
      when: agreement.harvestDate,
      farmerId: agreement.farmerId,
    });
  }

  // --- Farmers this executive registered that are still not approved --------
  for (const farmer of farmers) {
    if (farmer.status !== 'PENDING_VERIFICATION') continue;

    const waiting = today.diff(dayjs(farmer.createdAt).startOf('day'), 'day');
    if (waiting < 2) continue; // give the approver a day or two before nagging

    items.push({
      key: `unapproved-${farmer.id}`,
      kind: 'unapproved-farmer',
      title: farmer.fullName,
      detail: `Registered ${waiting} days ago and still not approved. Until they are, they cannot be inspected or collected from.`,
      actionLabel: 'Open',
      actionPath: '/farmers',
      urgency: waiting > 7 ? 'overdue' : 'soon',
      when: farmer.createdAt,
      farmerId: farmer.id,
    });
  }

  // --- Farmers whose record is missing something that will bite later -------
  for (const farmer of farmers) {
    const missing: string[] = [];
    if (!farmer.bankAccountNo) missing.push('bank details');
    if (!farmer.gpsLocation) missing.push('location');
    if (missing.length === 0) continue;

    items.push({
      key: `incomplete-${farmer.id}`,
      kind: 'incomplete-farmer',
      title: farmer.fullName,
      detail: `Missing ${missing.join(' and ')}. Far easier to capture at the farm than at the weighbridge.`,
      actionLabel: 'Complete',
      actionPath: '/farmers',
      urgency: missing.includes('bank details') ? 'soon' : 'soon',
      when: farmer.createdAt,
      farmerId: farmer.id,
    });
  }

  // --- Farmers nobody has visited in a while --------------------------------
  const lastVisitByFarmer = new Map<string, string>();
  for (const visit of visits) {
    const existing = lastVisitByFarmer.get(visit.farmerId);
    if (!existing || dayjs(visit.visitDate).isAfter(existing)) {
      lastVisitByFarmer.set(visit.farmerId, visit.visitDate);
    }
  }

  for (const farmer of farmers) {
    if (farmer.status !== 'ACTIVE') continue;
    // Already has a visit planned - that item says it better than a nag.
    if (plannedFarmerIds.has(farmer.id)) continue;
    const last = lastVisitByFarmer.get(farmer.id);
    const since = last ? today.diff(dayjs(last).startOf('day'), 'day') : null;
    if (since !== null && since < FOLLOW_UP_DAYS) continue;

    items.push({
      key: `follow-up-${farmer.id}`,
      kind: 'follow-up',
      title: farmer.fullName,
      detail: last
        ? `Last visited ${since} days ago.`
        : 'Never visited since approval.',
      actionLabel: 'Log a visit',
      actionPath: '/visits',
      urgency: 'soon',
      when: last ?? farmer.createdAt,
      farmerId: farmer.id,
    });
  }

  return items.sort((a, b) => {
    const rank: Record<Urgency, number> = { overdue: 0, today: 1, soon: 2 };
    if (rank[a.urgency] !== rank[b.urgency]) return rank[a.urgency] - rank[b.urgency];
    return dayjs(a.when).valueOf() - dayjs(b.when).valueOf();
  });
}

export const URGENCY_COLOUR: Record<Urgency, string> = {
  overdue: 'red',
  today: 'gold',
  soon: 'blue',
};

export const KIND_LABEL: Record<ScheduleKind, string> = {
  training: 'Training',
  'harvest-due': 'Harvest gate',
  'incomplete-farmer': 'Incomplete',
  'unapproved-farmer': 'Awaiting approval',
  'follow-up': 'Follow-up',
  'planned-visit': 'Planned visit',
};
