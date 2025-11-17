export type ConversationRole = "system" | "user" | "assistant" | "tool";

export interface ConversationEntry {
  role: ConversationRole;
}

export function findLastUserIndex(entries: ConversationEntry[]): number;
