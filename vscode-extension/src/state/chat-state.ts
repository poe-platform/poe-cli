export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
}

export class ChatState {
  private readonly history: ChatMessage[] = [];
  private responseTimestamp: Date | null = null;

  get messages(): ChatMessage[] {
    return [...this.history];
  }

  get lastResponseAt(): Date | null {
    return this.responseTimestamp ? new Date(this.responseTimestamp) : null;
  }

  append(message: ChatMessage): void {
    const entry: ChatMessage = {
      ...message,
      createdAt: message.createdAt ?? new Date()
    };
    this.history.push(entry);
    if (entry.role === "assistant") {
      this.responseTimestamp = entry.createdAt ?? new Date();
    }
  }

  clear(): void {
    this.history.length = 0;
    this.responseTimestamp = null;
  }
}

