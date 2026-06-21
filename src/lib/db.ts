// Supabase 表行 ↔ 应用内 camelCase 类型 的转换。只在 store.tsx 里使用。

import type { Account, CalendarEvent, Note } from "./types";

export function fromDbProfile(row: any): Account {
  return {
    name: row.name ?? "",
    email: row.email ?? "",
    trialStartedAt: row.trial_started_at,
    subscribed: row.subscribed ?? false,
    plan: row.plan ?? null,
    billing: row.billing ?? null,
    subscribedAt: row.subscribed_at ?? null,
    pendingBilling: row.pending_billing ?? null,
    pendingBillingEffectiveAt: row.pending_billing_effective_at ?? null,
    referralCode: row.referral_code ?? "",
    referredBy: row.referred_by ?? null,
    trialDays: row.trial_days ?? 15,
    membershipCreditUntil: row.membership_credit_until ?? null,
    stripeCustomerId: row.stripe_customer_id ?? null,
    stripeSubscriptionId: row.stripe_subscription_id ?? null,
  };
}

export function fromDbEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title ?? "",
    location: row.location ?? "",
    description: row.description ?? "",
    start: row.start,
    end: row.end,
    allDay: row.all_day ?? false,
    completed: row.completed ?? false,
    color: row.color ?? undefined,
    recurrence: row.recurrence ?? "none",
    customIntervalDays: row.custom_interval_days ?? undefined,
    recurrenceOccurrences: row.recurrence_occurrences ?? null,
    reminders: row.reminders ?? [],
    source: row.source ?? "manual",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDbEvent(ev: CalendarEvent, userId: string) {
  return {
    id: ev.id,
    user_id: userId,
    title: ev.title,
    location: ev.location,
    description: ev.description,
    start: ev.start,
    end: ev.end,
    all_day: ev.allDay,
    completed: ev.completed,
    color: ev.color ?? null,
    recurrence: ev.recurrence,
    custom_interval_days: ev.customIntervalDays ?? null,
    recurrence_occurrences: ev.recurrenceOccurrences ?? null,
    reminders: ev.reminders,
    source: ev.source,
    created_at: ev.createdAt,
    updated_at: ev.updatedAt,
  };
}

export function fromDbNote(row: any): Note {
  return {
    id: row.id,
    title: row.title ?? "",
    contentHtml: row.content_html ?? "",
    tags: row.tags ?? [],
    pinned: row.pinned ?? false,
    archived: row.archived ?? false,
    reminderAt: row.reminder_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDbNote(n: Note, userId: string) {
  return {
    id: n.id,
    user_id: userId,
    title: n.title,
    content_html: n.contentHtml,
    tags: n.tags,
    pinned: n.pinned,
    archived: n.archived,
    reminder_at: n.reminderAt,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
  };
}
