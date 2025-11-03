export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
}

export class ChatState {
  private readonly history: ChatMessage[] = [];
  private responseTimestamp: Date | null = null;
  private assistantResponding = false;

  get messages(): ChatMessage[] {
    return [...this.history];
  }

  get lastResponseAt(): Date | null {
    return this.responseTimestamp ? new Date(this.responseTimestamp) : null;
  }

  get isAssistantResponding(): boolean {
    return this.assistantResponding;
  }

  setAssistantResponding(active: boolean): void {
    this.assistantResponding = active;
  }

  append(message: ChatMessage): void {
    const entry: ChatMessage = {
      ...message,
      createdAt: message.createdAt ?? new Date()
    };
    this.history.push(entry);
    if (entry.role === "assistant") {
      this.responseTimestamp = entry.createdAt ?? new Date();
      this.assistantResponding = false;
    } else if (entry.role === "user") {
      this.assistantResponding = true;
    }
  }

  clear(): void {
    this.history.length = 0;
    this.responseTimestamp = null;
    this.assistantResponding = false;
  }
}
