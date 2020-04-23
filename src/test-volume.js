
const test = require("ava");
const Cp   = require("child_process");
const Fs   = require("fs");
const TaskSet = require("./TaskSet");

TaskSet.setLogLevel("SILENT"); // set to DEBUG for diagnosis

Cp.execSync("rm -f build/vol*");


function copyFile(from, to) {
  Fs.copyFileSync(from, to);
}

function makeFile(name) {
  const data = String(Date.now()) + "-" + String(Math.random() * 10e12);
  Fs.writeFileSync(name, data, {
    encoding: "utf8",
  });
}


function makeLevel(taskset, level, max_level, target) {

  const prereqs = [];

  for (let i = 0; i < 10; i += 1) {
    const prereq = `${target}-${i}`;
    prereqs.push(prereq);
    if (level < max_level) {
      makeLevel(taskset, level + 1, max_level, prereq);
    } else {
      makeFile(prereq);
    }
  }
  taskset.add(null, target, prereqs, () => {
    copyFile(prereqs[0], target);
  });

}


test("large volume", async t => {

  const taskset = TaskSet();

  // t.timeout(300 * 1000); // milliseconds

  makeLevel(taskset, 0, 3, "build/vol");

  return taskset.run(`build/vol`)
    .then((count) => {
      t.is(count, 1111, "1111 tasks executed");
      Cp.execSync("rm -f build/vol*");
    });
});
