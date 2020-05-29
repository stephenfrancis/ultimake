# ultimake
Ultimate Make Toolkit

![Node.js CI](https://github.com/stephenfrancis/ultimake/workflows/Node.js%20CI/badge.svg)


I know, Yet Another Javascript Make Tool.

Its goal is to help make better builds by:
* being fast
* having really good validation
* having a simple API
* being well supported

## Usage and API

More information and examples of [Use Cases](src/doc-use-cases.md) or
[Validations and Errors](src/doc-validations-and-errors.md).


`npm install --save ultimake`


### 1. Use the TaskSet Object Directly

```
  const newTaskSet = require("ultimake").newTaskSet;

  // change level of logging output if desired
  newTaskSet.setLogLevel("ERROR");

  // make a new TaskSet object
  const taskset = newTaskSet();

  // add a task to the TaskSet object

  taskset.add(

    "task title",                 // task title is optional - leave null if you like
                                  // - but then target is REQUIRED and task name is
                                  //   generated as "file: " + target name

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

e.g. src/config/build.js:

```
#!/usr/bin/env node

const Ultimake = require("ultimake");
const { run, task } = Ultimake.getBuildFunctions();

// task(...) = taskset.add(...)

// Ultimake.exec("os command", options); - returns a promise on child_process.exec()

// Ultimake.glob("src/**/*.ts") = require("glob").sync() - returns an array of strings

// run() = taskset.run(cmd line target)


const source = Ultimake.glob("src/**/*.ts");
const target = source
  .map(filename => filename.replace(/^src/, "build/").replace(/\.ts$/, ".js"));

task("build", target, source, () => {
  return Ultimake.exec("tsc");
});

run();

```

`> src/config/build.js build`
