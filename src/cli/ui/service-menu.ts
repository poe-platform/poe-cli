import chalk from "chalk";
import type { ProviderAdapter } from "../service-registry.js";
import {
  defaultMenuTheme,
  type MenuTheme
} from "./theme.js";

const HEADER_WIDTH = 70;

const repeat = (char: string, count: number): string => char.repeat(count);

export interface RenderServiceMenuOptions {
  theme?: MenuTheme;
}

function formatProviderLabel(
  service: ProviderAdapter,
  theme: MenuTheme
): string {
  const palette = theme.palette;
  const colors = service.branding?.colors;
  if (colors) {
    const preferred =
      theme.name === "dark"
        ? colors.dark ?? colors.light
        : colors.light ?? colors.dark;
    if (preferred) {
      return chalk.hex(preferred).bold(service.label);
    }
  }
  return palette.providerFallback(service.label);
}

export function renderServiceMenu(
  services: ProviderAdapter[],
  options?: RenderServiceMenuOptions
): string[] {
  const theme = options?.theme ?? defaultMenuTheme;
  const palette = theme.palette;
  const border = repeat("=", HEADER_WIDTH);
  const divider = repeat("-", HEADER_WIDTH);

  const lines: string[] = [
    palette.divider(border),
    palette.header("poe-code · Configure coding agents with the Poe API"),
    palette.divider(divider),
    palette.prompt("Pick a service to configure:")
  ];

  services.forEach((service, index) => {
    const number = palette.number(index + 1);
    const label = formatProviderLabel(service, theme);
    lines.push(`${number} ${label}`);
  });

  lines.push(palette.divider(divider));

  return lines;
}
