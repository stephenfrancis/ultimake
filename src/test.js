
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

  let lm_b;

  // console.log(`Part A ${Date.now()}`);

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

      // console.log(`Part C ${Date.now()}`);
      return sleep(10);
    })
    .then(() => {
      // console.log(`Part D ${Date.now()}`);
      makeFile("build/b");
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.true(make_stack.length === 0, "0 tasks executed");
      t.true((lm_b < lastMod("build/b")), "b is unchanged");

      // console.log(`Part E ${Date.now()}`);
      return sleep(10);
    })
    .then(() => {
      // console.log(`Part F ${Date.now()}`);
      makeFile("build/a");
      // console.log(`Part G ${Date.now()}`);
      return sleep(10);
    })
    .then(() => {
      // console.log(`Part H ${Date.now()}`);
      return taskset.run("build/b");
    })
    .then((make_stack) => {
      t.is(make_stack.length, 1, "1 tasks executed");
      t.true(exists("build/b"), "copy a to b");
      t.true((lm_b < lastMod("build/b")), "b is updated");
      // console.log(`${lastMod("build/b")} > ${lastMod("build/a")}`);
      t.true(isNewerThan("build/b", "build/a"), "b is newer than a");
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
