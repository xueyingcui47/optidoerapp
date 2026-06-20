// 应用核心数据模型（对应 SOW 第 7 节的简化版，MVP 阶段存于本地）。

export type ID = string;

/** 提醒提前量（分钟）。0 = 准点。 */
export type ReminderOffset = number;

export interface Note {
  id: ID;
  title: string;
  /** 富文本内容（HTML 字符串，由 contentEditable 产出）。 */
  contentHtml: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  /** 可选：为笔记关联一个提醒时间（ISO 字符串）。 */
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly" | "weekdays" | "custom";

export interface CalendarEvent {
  id: ID;
  title: string;
  location: string;
  description: string;
  /** ISO 字符串。全天事件取当天 00:00。 */
  start: string;
  end: string;
  allDay: boolean;
  /** 是否已完成。 */
  completed: boolean;
  /** 标记颜色（见 lib/eventColors.ts），未设置则用默认色。 */
  color?: string;
  recurrence: RecurrenceFreq;
  /** 当 recurrence === "custom" 时，自定义间隔天数（每 N 天）。 */
  customIntervalDays?: number;
  /** 重复次数上限；undefined/null = 无限重复，否则重复 N 次后结束（recurrence !== "none" 时才有意义）。 */
  recurrenceOccurrences?: number | null;
  /** 提醒提前量列表（分钟）。 */
  reminders: ReminderOffset[];
  /** 标记来源，AI 生成的事件会标 "ai"。 */
  source: "manual" | "ai" | "import";
  createdAt: string;
  updatedAt: string;
}

export type ReminderChannel = "push" | "email";

export interface Account {
  name: string;
  email: string;
  /** 试用开始时间（账号创建时间）。 */
  trialStartedAt: string;
  /** 是否已订阅（MVP 用本地状态模拟）。 */
  subscribed: boolean;
  plan: "tier1" | "tier2" | null;
  billing: "monthly" | "yearly" | null;
  /** 订阅生效时间，用于判断是否仍在首月优惠期（月付首月 $0.01）。 */
  subscribedAt: string | null;
}

export interface AppSettings {
  /** AI 自然语言事件创建开关（默认开，但调用前会确认）。 */
  aiNlEventEnabled: boolean;
  /** 是否已经看过「发送到 Claude」的隐私确认。 */
  aiPrivacyAcknowledged: boolean;
  /** 智能日程建议——MVP 默认关闭（隐私敏感）。 */
  aiScheduleAssistantEnabled: boolean;
  /** 通知渠道偏好。 */
  channels: Record<ReminderChannel, boolean>;
  /** 默认事件提醒（分钟）。 */
  defaultReminderOffset: ReminderOffset;
  /** 开发用：模拟试用到期，便于测试硬付费墙。 */
  simulateTrialExpired: boolean;
}

export interface AppState {
  account: Account | null;
  notes: Note[];
  events: CalendarEvent[];
  settings: AppSettings;
  /** AI 调用审计日志（对应 SOW 4.4b.3「我的 AI 日志」）。 */
  aiLog: AiLogEntry[];
}

export interface AiLogEntry {
  id: ID;
  at: string;
  feature: "nl-event";
  inputChars: number;
  /** 实际调用了 Claude 还是本地 mock。 */
  engine: "claude" | "mock";
  summary: string;
}

/** AI 解析自然语言后返回的事件草稿。 */
export interface ParsedEventDraft {
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
  description: string | null;
  allDay: boolean;
  confidence: "high" | "medium" | "low";
  note?: string;
  /** 重复规则；不重复就是 "none"（mock 解析器不识别重复，永远是 "none"）。 */
  recurrence?: RecurrenceFreq;
  /** recurrence === "custom" 时的间隔天数。 */
  customIntervalDays?: number | null;
  /** 重复次数；null/undefined = 无限重复。 */
  recurrenceOccurrences?: number | null;
}
