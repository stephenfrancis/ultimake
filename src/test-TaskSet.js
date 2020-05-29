
const test = require("ava");
const Cp   = require("child_process");
const Fs   = require("fs");
const TaskSet = require("./TaskSet");

TaskSet.setLogLevel("SILENT"); // comment for diagnosis
// TaskSet.setLogLevel("DEBUG"); // uncomment for diagnosis

function copyFile(from, to) {
  Fs.copyFileSync(from, to);
}

function deleteAll() {
  Cp.execSync("rm -f build/[a-z]");
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
    // bigint: true,
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

test("simple file dependency", async t => {

  // deleteAll();
  makeFile("build/a");

  const taskset = TaskSet();
  // const lm_a = Fs.statSync("build/a").mtime;

  const task = taskset.add(null, "build/b", "build/a", (targets_raw, prereqs_raw, name) => {
    copyFile("build/a", "build/b");
    t.is(targets_raw, "build/b", "0th arg of recipe - targets");
    t.is(prereqs_raw, "build/a", "1st arg of recipe - prereqs");
    t.is(name, "file: build/b" , "2nd arg of recipe - name");
    return Promise.resolve(null);
  });

  t.is(taskset.getFile("build/a").getPath(), "build/a");
  t.is(task.getName(), "file: build/b");
  t.is(task.desc(), undefined);
  task.desc("foo");
  t.is(task.desc(), "foo");
  task.description("bar");
  t.is(task.desc(), "bar");
  t.true(!task.isCompleted(), "task is marked as not completed");
  t.true(task.needsMaking(), "task is marked as needing making");

  let lm_b;

  return sleep(10)
    .then(() => {
      return taskset.run("build/b");
    })
    .then((count) => {
      t.is(count, 1, "1 tasks executed");
      t.true(exists("build/b"), "copy a to b");
      t.true(isNewerThan("build/b", "build/a"), "b is newer than a");
      t.true((typeof task.getLastModified() === "number") && task.getLastModified() > lastMod("build/a"), "task last modified date");
      t.is(task, task.getMakeTask(), "a task's make-task is itself");
      t.true(task.isCompleted(), "task is marked as completed");
      t.true(!task.needsMaking(), "task is marked not needing making");
      lm_b = lastMod("build/b");
      return taskset.run("build/b");
    })
    .then((count) => {
      t.is(count, 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/b").mtime.valueOf()}`);
      t.true((lm_b === lastMod("build/b")), "b is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/b");
      return taskset.run("build/b");
    })
    .then((count) => {
      t.is(count, 0, "0 tasks executed");
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
    .then((count) => {
      t.is(count, 1, "1 tasks executed");
      t.true(exists("build/b"), "copy a to b");
      t.true((lm_b < lastMod("build/b")), "b is updated");
      t.true(isNewerThan("build/b", "build/a"), "b is newer than a");

      t.throws(() => {
        taskset.run("foo");
      }, {
        instanceOf: Error,
        message: "TaskSet.run(foo): no task identified to make file",
      });

      taskset.run("build/b");
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



test("2 <- 2 file dependency", async t => {

  const taskset = TaskSet();
  // deleteAll();

  makeFile("build/c");
  makeFile("build/d");
  // const lm_a = Fs.statSync("build/c").mtime;

  const task = taskset.add("build", [ "build/e", "build/f" ], [ "build/c", "build/d" ], () => {
    copyFile("build/c", "build/e");
    copyFile("build/d", "build/f");
    return Promise.resolve(null);
  });

  t.is(task.getName(), "build");

  let lm_c;

  return sleep(10)
    .then(() => {
      return taskset.run("build"); // invoke task by name
    })
    .then((count) => {
      t.is(count, 1, "1 task executed");
      t.true(exists("build/e"), "copy a to c");
      t.true(exists("build/f"), "copy b to d");
      t.true(isNewerThan("build/f", "build/d"), "d is newer than b");
      lm_c = lastMod("build/e");
      return taskset.run("build/e");
    })
    .then((count) => {
      t.is(count, 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/d").mtime.valueOf()}`);
      t.is(lm_c, lastMod("build/e"), "c is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/e");
      return taskset.run("build/e");
    })
    .then((count) => {
      t.is(count, 0, "0 tasks executed");
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
    .then((count) => {
      t.is(count, 1, "1 task executed");
      t.true(exists("build/e"), "copy a to c");
      t.true(isNewerThan("build/e", "build/c"), "c is newer than a");
    });

});



test("k <- i,j <- g,h; h <- g; file dependency - multi deps", t => {

  const taskset = TaskSet();
  // deleteAll();

  makeFile("build/g");
  // const lm_a = Fs.statSync("build/g").mtime;

  taskset.add(null, "build/h", "build/g", () => {
    copyFile("build/g", "build/h");
    return sleep(5);
  });

  taskset.add(null, [ "build/i", "build/j" ], [ "build/g", "build/h" ], () => {
    copyFile("build/g", "build/i");
    copyFile("build/h", "build/j");
    return sleep(5);
  });

  taskset.add(null, "build/k", [ "build/i", "build/j" ], () => {
    copyFile("build/i", "build/k");
    return sleep(5);
  });

  let lm_i;

  return sleep(10)
    .then(() => {           // oldest to newest: (h, i, j, k don't exist), g
      return taskset.run("build/k");
    })
    .then((count) => {      // now: g, h, i, j, k
      t.is(count, 3, "3 tasks executed");
      t.true(exists("build/h"), "copy g to h");
      t.true(exists("build/i"), "copy g to i");
      t.true(exists("build/j"), "copy h to j");
      t.true(exists("build/k"), "copy i to k");
      t.true(isNewerThan("build/h", "build/g"), "h is newer than g");
      t.true(isNewerThan("build/i", "build/g"), "i is newer than g");
      t.true(isNewerThan("build/j", "build/g"), "j is newer than g");
      t.true(isNewerThan("build/k", "build/g"), "k is newer than g");
      t.true(isNewerThan("build/i", "build/h"), "i is newer than h");
      t.true(isNewerThan("build/j", "build/h"), "j is newer than h");
      t.true(isNewerThan("build/k", "build/h"), "k is newer than h");
      t.true(isNewerThan("build/k", "build/i"), "k is newer than i");
      t.true(isNewerThan("build/k", "build/j"), "k is newer than j");
      lm_i = lastMod("build/i");
      return taskset.run("build/i");
    })
    .then((count) => {      // still: g, h, i, j, k
      t.is(count, 0, "0 tasks executed");
      // console.log(`${lm_b} === ${Fs.statSync("build/h").mtime.valueOf()}`);
      t.is(lm_i, lastMod("build/i"), "i is unchanged");

      return sleep(10);
    })
    .then(() => {
      makeFile("build/i");  // now: g, h, j, k, i
      return taskset.run("build/i");
    })
    .then((count) => {      // still: g, h, j, k, i
      t.is(count, 0, "0 tasks executed");
      t.true((lm_i < lastMod("build/i")), "i is unchanged");
      return taskset.run("build/k");
    })
    .then((count) => {      // now: g, h, j, i, k
      t.is(count, 1, "1 task executed");
      return sleep(10);
    })
    .then(() => {
      makeFile("build/g");  // now: h, j, i, k, g
      return sleep(10);
    })
    .then(() => {
      return taskset.run("build/i");
    })
    .then((count) => {      // now: k, g, h, i, j
      t.is(count, 2, "2 things made - g -> h then g, h -> i, j");
      t.true(exists("build/i"), "copy g to i");
      t.true(isNewerThan("build/i", "build/h"), "i is newer than h");
      t.true(isNewerThan("build/j", "build/h"), "j is newer than h");
      t.true(isNewerThan("build/h", "build/g"), "h is newer than g");
      t.true(isNewerThan("build/g", "build/k"), "g is newer than k");
      return sleep(10);
    })
    .then(() => {
      // prereq-of-prereq scenario - should rebuild k even though it is newer
      // than its direct prereqs, because one of their prereqs is newer...
      makeFile("build/k");
      makeFile("build/h");  // now: g, i, j, k, h
      t.true(isNewerThan("build/k", "build/i"), "k is newer than i");
      t.true(isNewerThan("build/k", "build/j"), "k is newer than j");
      t.true(isNewerThan("build/h", "build/j"), "h is newer than j");
      return sleep(10);
    })
    .then(() => {
      return taskset.run("build/k");
    })
    .then((count) => {      // now: g, h, i, j, k
      t.is(count, 2, "2 things made - g, h -> i, j then i, j -> k");
      t.true(isNewerThan("build/h", "build/g"), "h is newer than g");
      t.true(isNewerThan("build/i", "build/h"), "i is newer than h");
      t.true(isNewerThan("build/j", "build/h"), "j is newer than h");
      t.true(isNewerThan("build/k", "build/i"), "k is newer than i");
      t.true(isNewerThan("build/k", "build/j"), "k is newer than j");
    });

});


test("p <- n <- m <- p; dependency circularity", t => {

  const taskset = TaskSet();

  taskset.add(null, "build/p", "build/n", () => {});

  taskset.add(null, "build/n", "build/m", () => {});

  taskset.add(null, "build/m", "build/p", () => {});

  return sleep(10)
    .then(() => {
      return taskset.run("build/p");
    })
    .then(() => {
      t.fail("should have thrown");
    })
    .catch((error) => {
      t.is(error.message, "Task.make() \'file: build/p\' RECURSION, stack: file: build/p,file: build/n,file: build/m");
    });
});


test("unmade targets", t => {

  const taskset = TaskSet();

  taskset.add(null, [ "build/q", "build/r" ], null, () => {
    return Promise.resolve(null); // doesn't make q or r
  });

  return taskset.run("build/q")
    .then(() => {
      t.fail("should have thrown");
    })
    .catch((error) => {
      t.regex(error.message, /Task\.markCompleted\(\) 'file: build\/q \+ 1 other' failed to make targets: /);
      t.regex(error.message, /build\/q \[exists\? false, time diff: -\d{13}ms\]/);
      t.regex(error.message, /build\/r \[exists\? false, time diff: -\d{13}ms\]/);
    });
});


test("multi deps - prereqs as named tasks", t => {

  const taskset = TaskSet();
  // deleteAll();

  makeFile("build/s");
  // const lm_a = Fs.statSync("build/g").mtime;

  taskset.add("taskT", "build/t", "build/s", () => {
    copyFile("build/s", "build/t");
    return sleep(5);
  });

  taskset.add("taskU", [ "build/u", "build/v" ], [ "build/s", "taskT" ], () => {
    copyFile("build/s", "build/u");
    copyFile("build/t", "build/v");
    return sleep(5);
  });

  // non-cyclic loop: W <- T, U; U <- T - should be okay
  taskset.add("taskW", "build/w", [ "taskT", "taskU", ], () => {
    copyFile("build/u", "build/w");
    return sleep(5);
  });

  let lm_w;

  return sleep(10)
    .then(() => {           // (t, u, v, w), s
      return taskset.run("taskW");
    })
    .then((count) => {      // now: s, t, u, v, w
      t.is(count, 3, "3 tasks executed");
      t.true(exists("build/t"), "copy s to t");
      t.true(exists("build/u"), "copy s to u");
      t.true(exists("build/v"), "copy t to v");
      t.true(exists("build/w"), "copy u to w");
      t.true(isNewerThan("build/t", "build/s"), "t is newer than s");
      t.true(isNewerThan("build/u", "build/s"), "u is newer than s");
      t.true(isNewerThan("build/v", "build/t"), "v is newer than t");
      t.true(isNewerThan("build/w", "build/u"), "w is newer than u");
      lm_w = lastMod("build/w");
      return taskset.run("build/w");
    })
    .then((count) => {      // still: s, t, u, v, w
      t.is(count, 3, "3 tasks executed - specified by task name rather than file name");
      // console.log(`${lm_b} === ${Fs.statSync("build/h").mtime.valueOf()}`);
      t.true((lm_w < lastMod("build/w")), "w is changed");
      lm_w = lastMod("build/w");

      return sleep(10);
    })
    .then(() => {
      return taskset.run("taskW");
    })
    .then((count) => {
      t.is(count, 3, "3 tasks executed");
      t.true((lm_w < lastMod("build/w")), "w is changed");
    });

});


test("internal state", t => {
  const taskset = TaskSet();
  t.deepEqual(taskset.all_files, {}, "all_files initialised to an empty object");
  t.deepEqual(taskset.all_tasks, {}, "all_tasks initialised to an empty object");
  t.is(taskset.run_status, 0, "run_status initialised to 0");

  taskset.clear();
  t.deepEqual(taskset.all_files, {}, "all_files cleared to an empty object");
  t.deepEqual(taskset.all_tasks, {}, "all_tasks cleared to an empty object");
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
  t.throws(() => {
		taskset.add("foo", [ "blah" ], null, null);
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): a recipe function is required",
  });

  const task = taskset.add("foo", null, null, () => {});
  t.is(task.getName(), "foo");
  t.false(task.targetMatches("blah"), "targetMatches() always false if no targets defined");
  task.forEachTarget(() => {
    t.fail("no target - shouldn't be called");
  });
  task.targets_raw = () => {};
  t.throws(() => {
    task.forEachTarget();
  }, {
    instanceOf: Error,
    message: "Task.forEachTarget(): target type not supported at the moment: 'foo', function",
  });
  t.throws(() => {
    taskset.forEachPrereq(() => {}, [ () => {} ]);
  }, {
    instanceOf: Error,
    message: "TaskSet.forEachPrereq(): prereq type not supported at the moment: function",
  });

  t.throws(() => {
		taskset.add("foo", null, null, () => {});
  }, {
    instanceOf: Error,
    message: "TaskSet.add(): task 'foo' already exists",
  });
  // error.regex(error, //);

  task.recipe = 2;
  t.throws(() => {
		task.execute();
  }, {
    instanceOf: Error,
    message: "Task.execute(): invalid recipe 2 for 'foo'",
  });

  task.done = true;
  t.throws(() => {
		task.make();
  }, {
    instanceOf: Error,
    message: "Task.make() 'foo' has already been done",
  });

  const task2 = taskset.add(null, [ "b", "c", "d", "e" ], null, () => {});
  t.is(task2.getName(), "file: b + 3 others");

  const task3 = taskset.add(null, [ "a" ], null, () => {});
  t.is(task3.getName(), "file: a");

});


test("console.log output", t => {
  const orig_console_log = console.log;
  const log_capture = [];
  console.log = (str) => {
    log_capture.push(str);
  };
  const taskset = TaskSet();
  taskset.add("foo", [ "a", "b" ], [ "c", "d" ], () => {}, { description: "more about foo" });
  taskset.add("bar", null, null, () => {});
  taskset.list();
  t.deepEqual(log_capture, [ " bar  ", " foo  more about foo", ]);
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
