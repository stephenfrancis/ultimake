#!/usr/bin/env node

const BuildLib = require("./BuildLib");
const yargv = BuildLib.getArgs();
const target = yargv._ && (yargv._.length > 0) && yargv._[0] || null;

if (target === "version_click") {
  BuildLib.versionClick(yargv._[1], yargv._[2] || "");
}
