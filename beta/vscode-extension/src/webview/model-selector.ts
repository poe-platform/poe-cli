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

  const items = options.models
    .map((model) => {
      const isActive = model === options.selected;
      const classes = ["model-item"];
      if (isActive) {
        classes.push("active");
      }
      return `<li><button type="button" class="${classes.join(" ")}" data-model="${model}">${model}</button></li>`;
    })
    .join("");

  return `
    <div class="model-selector" data-allow-custom="true">
      <input type="search" list="model-list" value="${options.selected}" placeholder="Search models..." />
      <datalist id="model-list">
        ${suggestions}
      </datalist>
      <nav class="model-selector-list">
        <h3>Models</h3>
        <ul class="model-list">
          ${items}
        </ul>
      </nav>
    </div>
  `;
}
