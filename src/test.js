
const test = require("ava");
const Cp   = require("child_process");
const Fs   = require("fs");
const TaskSet = require("./TaskSet");

TaskSet.setLogLevel("SILENT"); // set to DEBUG for diagnosis

function copyFile(from, to) {
  Fs.copyFileSync(from, to);
}

function deleteAll() {
  Cp.execSync("rm -f build/*");
}

function exists(name) {
  try {
    Fs.statSync(name);
    return true;
  } catch (e) {
    return false;
  }
}

function isNewerThan(a, b) {
  return (lastMod(a) > lastMod(b));
}

function lastMod(name) {
  return Fs.statSync(name, {
    bigint: true,
  }).mtimeMs;
}

function makeFile(name) {
  const data = String(Date.now()) + "-" + String(Math.random() * 10e12);
  Fs.writeFileSync(name, data, {
    encoding: "utf8",
  });
}

function sleep(millis) {
  return new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
}

deleteAll();

//---------------------------------------------------------------------

test("simple file dependency", t => {

  // deleteAll();
  makeFile("build/a");

  const taskset = TaskSet();
  // const lm_a = Fs.statSync("build/a").mtime;

  taskset.add(null, "build/b", "build/a", (targets_raw, prereqs_raw, name) => {
    copyFile("build/a", "build/b");
    t.is(targets_raw, "build/b", "0th arg of recipe - targets");
    t.is(prereqs_raw, "build/a", "1st arg of recipe - prereqs");
    t.is(name, "rule: build/b" , "2nd arg of recipe - name");
    return Promise.resolve(null);
  });

  t.is(taskset.getFile("build/a").getPath(), "build/a");
  t.is(taskset.getTask("rule: build/b").descr, undefined);
  taskset.getTask("rule: build/b").desc("foo");
  t.is(taskset.getTask("rule: build/b").descr, "foo");
  taskset.getTask("rule: build/b").description("bar");
  t.is(taskset.getTask("rule: build/b").descr, "bar");

  let lm_b;

  return sleep(10)
    .then(() => {
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.true(make_stack.length === 1, "1 tasks executed");
      t.true(exists("build/b"), "copy a to b");
      t.true(isNewerThan("build/b", "build/a"), "b is newer than a");
      lm_b = lastMod("build/b");
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.true(make_stack.length === 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/b").mtime.valueOf()}`);
      t.true((lm_b === lastMod("build/b")), "b is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/b");
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.true(make_stack.length === 0, "0 tasks executed");
      t.true((lm_b < lastMod("build/b")), "b is unchanged");
      return sleep(10);
    })
    .then(() => {
      makeFile("build/a");
      return sleep(10);
    })
    .then(() => {
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 1, "1 tasks executed");
      t.true(exists("build/b"), "copy a to b");
      t.true((lm_b < lastMod("build/b")), "b is updated");
      t.true(isNewerThan("build/b", "build/a"), "b is newer than a");

      t.throws(() => {
        taskset.run("foo");
      }, {
        instanceOf: Error,
        message: "no task identified to make 'foo'",
      });

      t.throws(() => {
        taskset.run("foo");
      }, {
        instanceOf: Error,
        message: "TaskSet.run(): in the middle of a previous exection",
      });

      t.throws(() => {
        taskset.run();
      }, {
        instanceOf: Error,
        message: "TaskSet.run(): no target specified to run",
      });

    });

});



test("2 <- 2 file dependency", t => {

  const taskset = TaskSet();
  // deleteAll();

  makeFile("build/c");
  makeFile("build/d");
  // const lm_a = Fs.statSync("build/c").mtime;

  taskset.add(null, [ "build/e", "build/f" ], [ "build/c", "build/d" ], () => {
    copyFile("build/c", "build/e");
    copyFile("build/d", "build/f");
    return Promise.resolve(null);
  });

  let lm_c;

  return sleep(10)
    .then(() => {
      return taskset.run("build/e");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 1, "1 task executed");
      t.true(exists("build/e"), "copy a to c");
      t.true(exists("build/f"), "copy b to d");
      t.true(isNewerThan("build/f", "build/d"), "d is newer than b");
      lm_c = lastMod("build/e");
      return taskset.run("build/e");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/d").mtime.valueOf()}`);
      t.is(lm_c, lastMod("build/e"), "c is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/e");
      return taskset.run("build/e");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 0, "0 tasks executed");
      t.true((lm_c < lastMod("build/e")), "c is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/c");
      return sleep(10);
    })
    .then(() => {
      return taskset.run("build/e");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 1, "1 task executed");
      t.true(exists("build/e"), "copy a to c");
      t.true(isNewerThan("build/e", "build/c"), "c is newer than a");
    });

});



test("k <- h, i <- 2 <- 1 file dependency - multi deps", t => {

  const taskset = TaskSet();
  // deleteAll();

  makeFile("build/g");
  // const lm_a = Fs.statSync("build/g").mtime;

  taskset.add(null, "build/h", "build/g", () => {
    copyFile("build/g", "build/h");
    return Promise.resolve(null);
  });

  taskset.add(null, [ "build/i", "build/j" ], [ "build/g", "build/h" ], () => {
    copyFile("build/g", "build/i");
    copyFile("build/h", "build/j");
    return Promise.resolve(null);
  });

  taskset.add(null, "build/k", [ "build/i", "build/j" ], () => {
    copyFile("build/i", "build/k");
    return Promise.resolve(null);
  });

  let lm_i;

  return sleep(10)
    .then(() => {
      return taskset.run("build/k");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 3, "3 tasks executed");
      t.true(exists("build/h"), "copy g to h");
      t.true(exists("build/i"), "copy g to i");
      t.true(exists("build/j"), "copy h to j");
      t.true(exists("build/k"), "copy i to k");
      t.true(isNewerThan("build/h", "build/g"), "h is newer than g");
      t.true(isNewerThan("build/i", "build/g"), "i is newer than g");
      t.true(isNewerThan("build/j", "build/g"), "j is newer than g");
      t.true(isNewerThan("build/k", "build/g"), "k is newer than g");
      lm_i = lastMod("build/i");
      return taskset.run("build/i");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/h").mtime.valueOf()}`);
      t.is(lm_i, lastMod("build/i"), "i is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/i");
      return taskset.run("build/i");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 0, "0 tasks executed");
      t.true((lm_i < lastMod("build/i")), "i is unchanged");
      return taskset.run("build/k");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 1, "1 task executed");
      return sleep(10);
    })
    .then(() => {
      makeFile("build/g");
      return sleep(10);
    })
    .then(() => {
      return taskset.run("build/i");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 2, "2 things made - g was older than i");
      t.true(exists("build/i"), "copy g to i");
      t.true(isNewerThan("build/i", "build/g"), "i is newer than g");
    });

});




test("p <- n <- m <- p; dependency circularity", t => {

  const taskset = TaskSet();
  // deleteAll();


  taskset.add(null, "build/p", "build/n", () => {
    copyFile("build/n", "build/p");
    return Promise.resolve(null);
  });

  taskset.add(null, "build/n", "build/m", () => {
    copyFile("build/m", "build/n");
    return Promise.resolve(null);
  });

  taskset.add(null, "build/m", "build/p", () => {
    copyFile("build/p", "build/m");
    return Promise.resolve(null);
  });


  return sleep(10)
    .then(() => {
      return taskset.run("build/p");
    })
    .then(() => {
      t.fail();
    })
    .catch((error) => {
      t.is(error.message, "Task.make() \'rule: build/p\' RECURSION, stack: rule: build/p,rule: build/n,rule: build/m");
    });

});



test("internal state", t => {
  const taskset = TaskSet();
  t.deepEqual(taskset.all_files, {}, "all_files initialised to an empty object");
  t.deepEqual(taskset.all_tasks, {}, "all_tasks initialised to an empty object");
  t.is(taskset.run_status, 0, "run_status initialised to 0");
});


test("general validation", t => {
  const taskset = TaskSet();
  // const error =
  t.throws(() => {
		taskset.add(1, null, null, () => {});
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): no task name nor targets",
  });
  t.throws(() => {
		taskset.add(null, [], null, () => {});
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): no task name nor targets",
  });
  t.throws(() => {
		taskset.add(null, [ null, "blah" ], null, () => {});
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): invalid first target: ,blah",
  });
  taskset.add("foo", null, null, () => {});
  t.throws(() => {
		taskset.add("foo", null, null, () => {});
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): task 'foo' already exists",
  });
  // error.regex(error, //);

  taskset.getTask("foo").recipe = 2;
  t.throws(() => {
		taskset.getTask("foo").execute();
  }, {
    instanceOf: Error,
    message: "Task.execute(): invalid recipe 2 for 'foo'",
  });

});


test("console.log output", t => {
  const orig_console_log = console.log;
  const log_capture = [];
  console.log = (str) => {
    log_capture.push(str);
  };
  const taskset = TaskSet();
  taskset.add("foo", [ "a", "b" ], [ "c", "d" ], () => {}, { description: "more about foo" });
  taskset.add("bar", null, null, () => {}, { description: "something about bar" });
  taskset.list();
  t.deepEqual(log_capture, [ " bar  something about bar", " foo  more about foo", ]);
  log_capture.splice(0, log_capture.length);

  taskset.which("foo");
  t.deepEqual(log_capture, [ "TaskSet.which(foo) - identified as a task", "  targets: a,b", "  prereqs: c,d" ]);
  log_capture.splice(0, log_capture.length);

  taskset.which("a");
  t.deepEqual(log_capture, [ "TaskSet.which(a) - assumed to be a file whose make-task is: foo" ]);
  log_capture.splice(0, log_capture.length);

  const orig_warn_log = TaskSet.getLoggers().Task.warn;
  TaskSet.getLoggers().Task.warn = console.log;

  taskset.getTask("foo").recipe = null;
  taskset.getTask("foo").execute();
  t.deepEqual(log_capture, [ "Task.execute(): 'foo' has no recipe, doing nothing" ]);
  log_capture.splice(0, log_capture.length);

  TaskSet.setLogLevel("SILENT"); // return to usual level

  console.log = orig_console_log;
  TaskSet.getLoggers().Task.warn = orig_warn_log;
});
