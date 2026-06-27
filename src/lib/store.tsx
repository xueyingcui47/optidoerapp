"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Account,
  AiLogEntry,
  AppSettings,
  AppState,
  CalendarEvent,
  Note,
} from "./types";
import { nextAnniversary, trialDaysLeft } from "./date";
import { supabase, supabaseEnabled } from "./supabaseClient";
import { fromDbEvent, fromDbNote, fromDbProfile, toDbEvent, toDbNote } from "./db";

const STORAGE_KEY = "optidoerapp.state.v1";
// 接了 Supabase 后，account/events/notes 不再放本地（避免同一台设备换账号时数据串台）；
// 只有 settings/aiLog 这类「不跨端同步」的偏好还存本地。
const LOCAL_ONLY_KEY = "optidoerapp.localOnly.v1";

const DEFAULT_SETTINGS: AppSettings = {
  aiNlEventEnabled: true,
  aiPrivacyAcknowledged: false,
  aiScheduleAssistantEnabled: false,
  channels: { push: true, email: true },
  defaultReminderOffset: 10,
  simulateTrialExpired: false,
};

const EMPTY_STATE: AppState = {
  account: null,
  notes: [],
  events: [],
  settings: DEFAULT_SETTINGS,
  aiLog: [],
};

function uid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowISO(): string {
  return new Date().toISOString();
}

function load(): AppState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...EMPTY_STATE,
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    };
  } catch {
    return EMPTY_STATE;
  }
}

function loadLocalOnly(): Pick<AppState, "settings" | "aiLog"> {
  if (typeof window === "undefined") return { settings: DEFAULT_SETTINGS, aiLog: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_ONLY_KEY);
    if (!raw) return { settings: DEFAULT_SETTINGS, aiLog: [] };
    const parsed = JSON.parse(raw);
    return { settings: { ...DEFAULT_SETTINGS, ...parsed.settings }, aiLog: parsed.aiLog ?? [] };
  } catch {
    return { settings: DEFAULT_SETTINGS, aiLog: [] };
  }
}

// camelCase 字段名 → 数据库列名（用于局部 update，不需要整行映射）。
const EVENT_COL: Record<string, string> = {
  allDay: "all_day",
  customIntervalDays: "custom_interval_days",
  recurrenceOccurrences: "recurrence_occurrences",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const NOTE_COL: Record<string, string> = {
  contentHtml: "content_html",
  reminderAt: "reminder_at",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

function mapPatch(patch: Record<string, unknown>, colMap: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[colMap[k] ?? k] = v;
  return out;
}

interface AuthResult {
  error?: string;
}

interface StoreApi {
  state: AppState;
  ready: boolean;

  // 账号 / 试用 / 订阅
  createAccount: (name: string, email: string) => void;
  resetAccount: () => void;
  // 年费 → 月付是"预约"而不是立即生效，见 pendingBilling/pendingBillingEffectiveAt 字段。
  subscribe: (plan: "tier1" | "tier2", billing: "monthly" | "yearly") => void;
  cancelPendingBillingChange: () => void;
  cancelSubscription: () => void;
  trialLeft: number;
  locked: boolean; // 试用到期且未订阅 → 硬付费墙

  // Supabase 账号系统（未配置 Supabase 时这三个会返回错误，UI 应回退到 createAccount 本地模式）
  // referralCode 可选：填了别人的邀请码，注册时数据库会自动把自己的试用延长到 45 天，
  // 同时如果邀请人当时是付费用户，邀请人会得到 1 个月的会员有效期延长（见 schema.sql 的触发器）。
  signUp: (name: string, email: string, password: string, referralCode?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;

  // 忘记密码：先发重置邮件，用户点邮件里的链接回到本站时 recovery=true，
  // 此时 AppShell 会显示「设置新密码」表单，调用 updatePassword 完成后 recovery 恢复 false。
  recovery: boolean;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;

  // 设置
  updateSettings: (patch: Partial<AppSettings>) => void;

  // 笔记
  addNote: (partial?: Partial<Note>) => Note;
  updateNote: (id: string, patch: Partial<Note>) => void;
  deleteNote: (id: string) => void;

  // 事件
  addEvent: (e: Omit<CalendarEvent, "id" | "createdAt" | "updatedAt">) => CalendarEvent;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deleteEvent: (id: string) => void;

  // AI 日志
  logAi: (entry: Omit<AiLogEntry, "id" | "at">) => void;
  clearAiLog: () => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  async function hydrateFromServer(uidValue: string) {
    if (!supabase) return;
    setUserId(uidValue);
    const [profileRes, eventsRes, notesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uidValue).maybeSingle(),
      supabase.from("events").select("*").eq("user_id", uidValue),
      supabase.from("notes").select("*").eq("user_id", uidValue),
    ]);
    if (profileRes.error) console.error("Failed to load profile", profileRes.error);
    if (eventsRes.error) console.error("Failed to load events", eventsRes.error);
    if (notesRes.error) console.error("Failed to load notes", notesRes.error);

    let account = profileRes.data ? fromDbProfile(profileRes.data) : null;

    // 正常情况下注册时的数据库 trigger 会自动建好 profile；
    // 万一没有（trigger 没跑成功等），这里自愈式补建一行，避免用户卡在登录页进不去。
    if (!account) {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email ?? "";
      const { data: created, error: createErr } = await supabase
        .from("profiles")
        .upsert({ id: uidValue, email, name: "" }, { onConflict: "id" })
        .select()
        .maybeSingle();
      if (createErr) console.error("Failed to self-heal missing profile", createErr);
      else if (created) account = fromDbProfile(created);
    }

    // 设置以数据库为准（跨设备同步）；DB 里没有的字段用默认值补齐。
    // simulateTrialExpired 是开发用的本地开关，不从 DB 取，避免污染真实账号。
    const dbSettings = (profileRes.data?.settings ?? {}) as Partial<AppSettings>;

    setState((s) => ({
      ...s,
      account,
      events: (eventsRes.data ?? []).map(fromDbEvent),
      notes: (notesRes.data ?? []).map(fromDbNote),
      settings: { ...DEFAULT_SETTINGS, ...dbSettings, simulateTrialExpired: s.settings.simulateTrialExpired },
    }));
    setReady(true);
  }

  // 初始加载：未配置 Supabase → 走纯本地（保留原有 demo 行为）；
  // 配置了 Supabase → 看有没有已登录 session，有就从数据库拉数据。
  useEffect(() => {
    if (!supabaseEnabled || !supabase) {
      const local = load();
      setState(local);
      setReady(true);
      return;
    }

    setState((s) => ({ ...s, ...loadLocalOnly() }));

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) hydrateFromServer(data.session.user.id);
      else setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (session) hydrateFromServer(session.user.id);
      else {
        setUserId(null);
        setState((s) => ({ ...EMPTY_STATE, settings: s.settings, aiLog: s.aiLog }));
        setReady(true);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 持久化：未配置 Supabase 时整份 state 存本地（原有行为）；
  // 配置了 Supabase 时，account/events/notes 已经在数据库里，本地只缓存 settings/aiLog。
  useEffect(() => {
    if (!ready) return;
    try {
      if (!supabaseEnabled) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        window.localStorage.setItem(
          LOCAL_ONLY_KEY,
          JSON.stringify({ settings: state.settings, aiLog: state.aiLog })
        );
      }
    } catch {
      // 忽略配额错误
    }
  }, [state, ready]);

  // 结算"预约切月付"：每次账号数据变化时检查一下，到期日一过就真正把 billing 切成
  // monthly（同时把账单周期起点重置到这一天），不需要专门的后台定时任务。
  useEffect(() => {
    const account = state.account;
    if (!account?.pendingBilling || !account.pendingBillingEffectiveAt) return;
    if (new Date(account.pendingBillingEffectiveAt) > new Date()) return;
    const newSubscribedAt = account.pendingBillingEffectiveAt;
    setState((s) =>
      s.account?.pendingBilling
        ? {
            ...s,
            account: {
              ...s.account,
              billing: "monthly",
              subscribedAt: newSubscribedAt,
              pendingBilling: null,
              pendingBillingEffectiveAt: null,
            },
          }
        : s
    );
    if (supabaseEnabled && supabase && userId) {
      supabase
        .from("profiles")
        .update({
          billing: "monthly",
          subscribed_at: newSubscribedAt,
          pending_billing: null,
          pending_billing_effective_at: null,
        })
        .eq("id", userId)
        .then(({ error }) => error && console.error("settle pendingBilling sync failed", error));
    }
  }, [state.account, userId]);

  const api = useMemo<StoreApi>(() => {
    const trialLeft = state.account
      ? state.account.subscribed
        ? Infinity
        : trialDaysLeft(state.account.trialStartedAt, state.account.trialDays)
      : 0;

    const locked =
      !!state.account &&
      !state.account.subscribed &&
      (state.settings.simulateTrialExpired || trialLeft <= 0);

    const doSignOut = async () => {
      if (supabase) await supabase.auth.signOut();
      setUserId(null);
      setState((s) => ({ ...EMPTY_STATE, settings: s.settings, aiLog: s.aiLog }));
    };

    return {
      state,
      ready,
      trialLeft,
      locked,

      // 本地模式专用（未配置 Supabase 时 Onboarding 用这个）。
      createAccount: (name, email) => {
        if (supabaseEnabled) return; // 真实部署走 signUp
        setState((s) => ({
          ...s,
          account: {
            name,
            email,
            trialStartedAt: nowISO(),
            subscribed: false,
            plan: null,
            billing: null,
            subscribedAt: null,
            pendingBilling: null,
            pendingBillingEffectiveAt: null,
            referralCode: "",
            referredBy: null,
            trialDays: 15,
            membershipCreditUntil: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          },
        }));
      },

      resetAccount: () => {
        if (supabaseEnabled) {
          void doSignOut();
          return;
        }
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {}
        setState(EMPTY_STATE);
      },

      signUp: async (name, email, password, referralCode) => {
        if (!supabase) return { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_* in .env.local)." };
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, referral_code: referralCode?.trim() || null } },
        });
        if (error) return { error: error.message };
        if (data.session) {
          await hydrateFromServer(data.session.user.id);
          return {};
        }
        return { error: "Account created! Please check your email to verify your address before signing in." };
      },

      signIn: async (email, password) => {
        if (!supabase) return { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_* in .env.local)." };
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };
        if (data.session) await hydrateFromServer(data.session.user.id);
        return {};
      },

      signOut: doSignOut,

      recovery,

      requestPasswordReset: async (email) => {
        if (!supabase) return { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_* in .env.local)." };
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        if (error) return { error: error.message };
        return {};
      },

      updatePassword: async (newPassword) => {
        if (!supabase) return { error: "Supabase is not configured (missing NEXT_PUBLIC_SUPABASE_* in .env.local)." };
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) return { error: error.message };
        setRecovery(false);
        return {};
      },

      subscribe: (plan, billing) => {
        const current = state.account;
        // 年费用户想切月付：不立即生效，预约到当前已付的这一年到期那天才真正切换
        // （避免刚付了年费优惠价就能立刻退回月付的怪异体验）。月付随时可以立即切年付。
        const isYearlyToMonthlyDowngrade =
          !!current?.subscribed && current.billing === "yearly" && billing === "monthly";

        if (isYearlyToMonthlyDowngrade && current?.subscribedAt) {
          const effectiveAt = nextAnniversary(new Date(current.subscribedAt), new Date()).toISOString();
          setState((s) => ({
            ...s,
            account: s.account ? { ...s.account, plan, pendingBilling: "monthly", pendingBillingEffectiveAt: effectiveAt } : s.account,
          }));
          if (supabaseEnabled && supabase && userId) {
            supabase
              .from("profiles")
              .update({ plan, pending_billing: "monthly", pending_billing_effective_at: effectiveAt })
              .eq("id", userId)
              .then(({ error }) => error && console.error("subscribe (schedule downgrade) sync failed", error));
          }
          return;
        }

        const subscribedAt = nowISO();
        setState((s) => ({
          ...s,
          account: s.account
            ? { ...s.account, subscribed: true, plan, billing, subscribedAt, pendingBilling: null, pendingBillingEffectiveAt: null }
            : s.account,
          settings: { ...s.settings, simulateTrialExpired: false },
        }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("profiles")
            .update({
              subscribed: true,
              plan,
              billing,
              subscribed_at: subscribedAt,
              pending_billing: null,
              pending_billing_effective_at: null,
            })
            .eq("id", userId)
            .then(({ error }) => error && console.error("subscribe sync failed", error));
        }
      },

      cancelPendingBillingChange: () => {
        setState((s) => ({
          ...s,
          account: s.account ? { ...s.account, pendingBilling: null, pendingBillingEffectiveAt: null } : s.account,
        }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("profiles")
            .update({ pending_billing: null, pending_billing_effective_at: null })
            .eq("id", userId)
            .then(({ error }) => error && console.error("cancelPendingBillingChange sync failed", error));
        }
      },

      cancelSubscription: () => {
        setState((s) => ({
          ...s,
          account: s.account
            ? {
                ...s.account,
                subscribed: false,
                plan: null,
                billing: null,
                subscribedAt: null,
                pendingBilling: null,
                pendingBillingEffectiveAt: null,
              }
            : s.account,
        }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("profiles")
            .update({
              subscribed: false,
              plan: null,
              billing: null,
              subscribed_at: null,
              pending_billing: null,
              pending_billing_effective_at: null,
            })
            .eq("id", userId)
            .then(({ error }) => error && console.error("cancelSubscription sync failed", error));
        }
      },

      updateSettings: (patch) => {
        const next = { ...state.settings, ...patch };
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
        if (supabaseEnabled && supabase && userId) {
          // simulateTrialExpired 是本地开发开关，不入库。
          const { simulateTrialExpired, ...toPersist } = next;
          supabase
            .from("profiles")
            .update({ settings: toPersist })
            .eq("id", userId)
            .then(({ error }) => error && console.error("updateSettings sync failed", error));
        }
      },

      addNote: (partial) => {
        const note: Note = {
          id: uid(),
          title: partial?.title ?? "",
          contentHtml: partial?.contentHtml ?? "",
          tags: partial?.tags ?? [],
          pinned: partial?.pinned ?? false,
          archived: partial?.archived ?? false,
          reminderAt: partial?.reminderAt ?? null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        setState((s) => ({ ...s, notes: [note, ...s.notes] }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("notes")
            .insert(toDbNote(note, userId))
            .then(({ error }) => error && console.error("addNote sync failed", error));
        }
        return note;
      },

      updateNote: (id, patch) => {
        const updatedAt = nowISO();
        setState((s) => ({
          ...s,
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt } : n)),
        }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("notes")
            .update(mapPatch({ ...patch, updatedAt }, NOTE_COL))
            .eq("id", id)
            .then(({ error }) => error && console.error("updateNote sync failed", error));
        }
      },

      deleteNote: (id) => {
        setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("notes")
            .delete()
            .eq("id", id)
            .then(({ error }) => error && console.error("deleteNote sync failed", error));
        }
      },

      addEvent: (e) => {
        const ev: CalendarEvent = {
          ...e,
          id: uid(),
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        setState((s) => ({ ...s, events: [...s.events, ev] }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("events")
            .insert(toDbEvent(ev, userId))
            .then(({ error }) => error && console.error("addEvent sync failed", error));
        }
        return ev;
      },

      updateEvent: (id, patch) => {
        const updatedAt = nowISO();
        setState((s) => ({
          ...s,
          events: s.events.map((ev) => (ev.id === id ? { ...ev, ...patch, updatedAt } : ev)),
        }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("events")
            .update(mapPatch({ ...patch, updatedAt }, EVENT_COL))
            .eq("id", id)
            .then(({ error }) => error && console.error("updateEvent sync failed", error));
        }
      },

      deleteEvent: (id) => {
        setState((s) => ({ ...s, events: s.events.filter((ev) => ev.id !== id) }));
        if (supabaseEnabled && supabase && userId) {
          supabase
            .from("events")
            .delete()
            .eq("id", id)
            .then(({ error }) => error && console.error("deleteEvent sync failed", error));
        }
      },

      logAi: (entry) =>
        setState((s) => ({
          ...s,
          aiLog: [{ ...entry, id: uid(), at: nowISO() }, ...s.aiLog].slice(0, 100),
        })),

      clearAiLog: () => setState((s) => ({ ...s, aiLog: [] })),
    };
  }, [state, ready, userId, recovery]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
