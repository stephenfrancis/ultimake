# ultimake
Ultimate Make Toolkit

I know, Yet Another Javascript Make Tool.

Its goal is to help make better builds by:
* being fast
* having really good validation
* having a simple API
* being well supported

## Usage and API


### 1. Use the TaskSet Object Directly

```
  const TaskSet = require("ultimake/TaskSet");

  // change level of logging output if desired
  TaskSet.setLogLevel("SILENT");

  // make a new TaskSet object
  const taskset = TaskSet();

  // add a task to the TaskSet object
  taskset.add("task title", "path/to/target/file", "path/to/prerequisite/file", (target, prereq, name) => {
    // recipe function, for creating target(s) from prerequisite(s)
    return Promise.resolve(null); // always return a promise!
  });
  // task title is optional - leave null if you like - but then target is REQUIRED and task name is generated as "file: " + target name
  // target is optional UNLESS task title is null - target can be a string (relative file path) OR an array of such strings
  // prerequisite can be null, or a string being a relative file path or another task name, OR an array of such strings
  // recipe function is REQUIRED and MUST return a promise that resolves when the work is done
  // optional 5th argument is an options object, currently only permissible option is "description"

  taskset.run("task or file name")
    .then(() => {
      // do something afterwards
    })
    .catch(err0r => {
      // something went wrong
    });

```

### 2. Use the Build Tools Library

```
const BuildLib = require("paraguay/BuildLib");
const { cli, exec, glob, task } = BuildLib.getBuildFunctions({
  build_vars_source: "src/config/BuildVars.json",
  build_vars_target: "build/vars.json",
});
```
