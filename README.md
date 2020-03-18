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

  taskset.add(

    "task title",                 // task title is optional - leave null if you like
                                  // - but then target is REQUIRED and task name is
                                  //   generated as "rule: " + target name

    "path/to/target/file",        // target is optional UNLESS task title is null
                                  // - target can be a string (relative file path)
                                  //   OR an array of such strings

    "path/to/prerequisite/file",  // prerequisite can be null, OR a string being a
                                  // relative file path or another task name,
                                  // OR an array of such strings

    (target, prereq, name) => {   // recipe function, for creating target(s) from
                                  // prerequisite(s) -  is REQUIRED and MUST return
                                  // a promise that resolves when the work is done
      return Promise.resolve(null);   // (MUST create/update ALL listed targets)
    },

    {                             // optional options object, currently the only
      description: "foo bar",     // permissible option is "description"
    }
  );


  taskset.run("task or file name")
    .then(() => {
      // do something afterwards
    })
    .catch(error => {
      // something went wrong
    });

```

### 2. Use the Build Tools Library

```
const BuildLib = require("paraguay/BuildLib");
const { exec, glob, run, task } = BuildLib.getBuildFunctions({
  build_vars_source: "src/config/BuildVars.json",
  build_vars_target: "build/vars.json",
});

// task() = taskset.add()

// exec("os command", options); - returns a promise on child_process.exec()

// glob("src/**/*.ts") = require("glob").sync() - returns an array of strings

// run() = taskset.run(cmd line target)

// e.g. src/config/build.js:
#!/usr/bin/env node

const source = glob("src/**/*.ts");
const target = source
  .map(filename => filename.replace(/^src/, "build/").replace(/\.ts$/, ".js"));

task("build", target, source, () => {
  return exec("tsc");
});

run();


// > src/config/build.js build

```
