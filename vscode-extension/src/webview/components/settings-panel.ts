import { LitElement, html, css, PropertyValues } from "lit";
import type { ProviderSetting } from "../../config/provider-settings.js";

export type StrategyKind = "smart" | "mixed" | "round-robin" | "fixed";

interface StrategyDescriptor {
  id: StrategyKind;
  title: string;
  description: string;
}

const STRATEGIES: StrategyDescriptor[] = [
  {
    id: "smart",
    title: "🧠 Smart",
    description: "Let Poe pick specialised models based on the request intent.",
  },
  {
    id: "mixed",
    title: "🔄 Mixed",
    description: "Alternate between two top models for balanced coverage.",
  },
  {
    id: "round-robin",
    title: "🔁 Round robin",
    description: "Cycle through all configured models sequentially.",
  },
  {
    id: "fixed",
    title: "📌 Fixed",
    description: "Always use a single model for predictable behaviour.",
  },
];

export class PoeSettingsPanel extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    providers: { attribute: false },
    models: { attribute: false },
    activeModel: { type: String },
    strategyEnabled: { type: Boolean },
    strategyType: { type: String },
    strategyInfo: { type: String },
    _modelInput: { state: true },
    _fixedModelInput: { state: true },
  };

  open = false;
  providers: ProviderSetting[] = [];
  models: string[] = [];
  activeModel = "";
  strategyEnabled = false;
  strategyType: StrategyKind = "fixed";
  strategyInfo = "";
  private _modelInput = "";
  private _fixedModelInput = "";

  static styles = css`
    :host {
      display: block;
      pointer-events: none;
    }

    :host([open]) {
      pointer-events: auto;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._modelInput = this.activeModel;
    this._fixedModelInput = this.activeModel;
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has("activeModel")) {
      this._modelInput = this.activeModel;
      if (this.strategyType === "fixed") {
        this._fixedModelInput = this.activeModel;
      }
    }

    if (changed.has("strategyType") && this.strategyType === "fixed") {
      this._fixedModelInput = this.activeModel;
    }
  }

  private emit<T>(type: string, detail?: T): void {
    this.dispatchEvent(
      new CustomEvent<T>(type, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private handleOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.requestClose();
    }
  }

  private requestClose(): void {
    this.emit("settings-close");
  }

  private handleModelInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this._modelInput = target.value;
  }

  private applyModel(model: string): void {
    const trimmed = model.trim();
    if (!trimmed.length) {
      return;
    }
    this.emit("model-change", { model: trimmed });
  }

  private handleModelSubmit(event: Event): void {
    event.preventDefault();
    this.applyModel(this._modelInput);
  }

  private handleFixedModelInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this._fixedModelInput = target.value;
  }

  private handleFixedModelCommit(event: Event): void {
    event.preventDefault();
    const trimmed = this._fixedModelInput.trim();
    if (!trimmed.length) {
      return;
    }
    this.emit("strategy-change", {
      config: { type: "fixed", fixedModel: trimmed },
    });
  }

  private handleStrategyToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.emit("strategy-toggle", { enabled: target.checked });
  }

  private handleStrategySelect(strategy: StrategyKind): void {
    if (this.strategyType === strategy) {
      return;
    }
    this.emit("strategy-change", {
      config:
        strategy === "fixed"
          ? { type: "fixed", fixedModel: this._fixedModelInput || this.activeModel }
          : { type: strategy },
    });
  }

  private handleOpenMcp(): void {
    this.emit("open-mcp");
  }

  private renderModelOption(option: ProviderSetting): unknown {
    const isActive = option.label === this.activeModel;
    const baseClasses =
      "w-full rounded-xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
    const className = isActive
      ? `${baseClasses} border-transparent bg-accent text-accent-fg shadow-sm`
      : `${baseClasses} border-border text-text-muted hover:border-border hover:bg-surface-raised hover:text-text`;
    return html`
      <button
        type="button"
        class="${className}"
        data-provider-id="${option.id}"
        @click=${() => this.applyModel(option.label)}
      >
        <div class="font-medium">${option.label}</div>
        <div class="text-xs text-text-muted">${option.id}</div>
      </button>
    `;
  }

  private renderStrategyOption(option: StrategyDescriptor): unknown {
    const isActive = option.id === this.strategyType;
    const baseClasses =
      "w-full rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
    const className = isActive
      ? `${baseClasses} border-accent bg-surface-raised`
      : `${baseClasses} border-border text-text-muted hover:border-border hover:bg-surface-raised hover:text-text`;
    return html`
      <button
        type="button"
        class="${className}"
        data-strategy="${option.id}"
        @click=${() => this.handleStrategySelect(option.id)}
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-text">${option.title}</span>
          ${isActive
            ? html`<span class="text-xs font-semibold text-accent">Selected</span>`
            : null}
        </div>
        <p class="mt-1 text-xs text-text-muted">${option.description}</p>
      </button>
    `;
  }

  render() {
    if (!this.open) {
      return html``;
    }

    return html`
      <div
        class="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
        @click=${this.handleOverlayClick}
      >
        <div
          class="flex h-full w-full max-w-md flex-col border-l border-border bg-surface-raised shadow-panel"
        >
          <header class="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 class="text-base font-semibold text-text">Assistant settings</h2>
              <p class="text-xs text-text-muted">
                Choose your default model and routing strategy.
              </p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              @click=${this.requestClose}
            >
              Close
            </button>
          </header>

          <div class="flex-1 space-y-6 overflow-y-auto px-5 py-6">
            <section class="space-y-3">
              <div>
                <h3 class="text-sm font-semibold text-text">Default model</h3>
                <p class="text-xs text-text-muted">
                  Select a configured provider or enter any Poe model identifier.
                </p>
              </div>
              <div class="space-y-2">
                ${this.providers.length > 0
                  ? this.providers.map((provider) => this.renderModelOption(provider))
                  : html`<p class="rounded-xl border border-dashed border-border bg-surface px-3 py-3 text-xs text-text-muted">
                      No providers configured yet. Open MCP configuration to add providers.
                    </p>`}
              </div>
              <form class="mt-3 flex gap-2" @submit=${this.handleModelSubmit}>
                <input
                  type="text"
                  class="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  placeholder="Custom model id"
                  .value=${this._modelInput}
                  @input=${this.handleModelInput}
                  autocomplete="off"
                />
                <button
                  type="submit"
                class="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-fg shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Use model
                </button>
              </form>
            </section>

            <section class="space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-text">Model strategy</h3>
                  <p class="text-xs text-text-muted">
                    Enable orchestration to let Poe choose models on the fly.
                  </p>
                </div>
                <label class="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    class="sr-only"
                    .checked=${this.strategyEnabled}
                    @change=${this.handleStrategyToggle}
                  />
                  <span
                    class=${`relative inline-flex h-5 w-10 items-center rounded-full border transition ${
                      this.strategyEnabled
                        ? "border-transparent bg-accent"
                        : "border-border bg-surface-raised"
                    }`}
                  >
                    <span
                      class=${`absolute left-1 h-3.5 w-3.5 rounded-full bg-surface transition ${
                        this.strategyEnabled ? "translate-x-5 bg-accent-fg" : ""
                      }`}
                    ></span>
                  </span>
                </label>
              </div>

              <div class="grid gap-2">
                ${STRATEGIES.map((strategy) => this.renderStrategyOption(strategy))}
              </div>

              ${this.strategyEnabled && this.strategyType === "fixed"
                ? html`
                    <div class="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-3 py-3">
                      <div class="flex-1">
                        <p class="text-xs font-medium text-text">
                          Fixed model id
                        </p>
                        <p class="text-[11px] text-text-muted">
                          Set the exact model Poe should use when the strategy is fixed.
                        </p>
                      </div>
                      <input
                        type="text"
                        class="w-48 rounded-xl border border-border bg-surface px-2 py-1 text-xs text-text focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        .value=${this._fixedModelInput}
                        @input=${this.handleFixedModelInput}
                        @blur=${this.handleFixedModelCommit}
                        autocomplete="off"
                      />
                    </div>
                  `
                : null}

              ${this.strategyInfo
                ? html`<p class="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-muted">
                    Active strategy: ${this.strategyInfo}
                  </p>`
                : null}
            </section>
          </div>

          <footer class="border-t border-border bg-surface px-5 py-4">
            <div class="flex items-center justify-between">
              <button
                type="button"
                data-action="open-mcp"
                class="rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-muted transition hover:border-border hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @click=${this.handleOpenMcp}
              >
                Open MCP configuration
              </button>
              <button
                type="button"
                class="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-fg shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                @click=${this.requestClose}
              >
                Done
              </button>
            </div>
          </footer>
        </div>
      </div>
    `;
  }
}

export function registerPoeSettingsPanel(registry?: CustomElementRegistry | null): void {
  if (!registry) {
    return;
  }
  if (registry.get("poe-settings-panel")) {
    return;
  }
  try {
    registry.define("poe-settings-panel", PoeSettingsPanel);
  } catch {
    // Ignore cross-realm definition issues; runtime will hydrate manually if needed.
  }
}

registerPoeSettingsPanel(
  (globalThis as typeof globalThis & { customElements?: CustomElementRegistry }).customElements ?? null
);
