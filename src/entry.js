#!/usr/bin/env node

const Main = require("./main");
const yargv = Main.getArgs();
const target = Main.getTarget();

if (target === "version_click") {
  Main.versionClick(yargv._[1]);
}
