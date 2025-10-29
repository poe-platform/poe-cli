interface ModelSelectorOptions {
  models: string[];
  selected: string;
}

export function renderModelSelector(options: ModelSelectorOptions): string {
  const suggestions = options.models
    .map(
      (model) =>
        `<option value="${model}"${
          model === options.selected ? " selected" : ""
        }>${model}</option>`
    )
    .join("");

  return `
    <div class="model-selector" data-allow-custom="true">
      <input type="search" list="model-list" value="${options.selected}" placeholder="Search models..." />
      <datalist id="model-list">
        ${suggestions}
      </datalist>
    </div>
  `;
}

