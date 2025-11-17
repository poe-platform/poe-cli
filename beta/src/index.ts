#!/usr/bin/env node
import { createCliMain, isCliInvocation } from "poe-code/dist/cli/bootstrap.js";
import { createProgram } from "./cli/program.js";

const main = createCliMain(createProgram);

if (isCliInvocation(process.argv, import.meta.url)) {
  void main();
}

export { main, isCliInvocation };
