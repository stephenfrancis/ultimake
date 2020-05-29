
const Fs       = require("fs");
const LogLevel = require("loglevel");
const Loggers = {
  File   : LogLevel.getLogger("File"),
  Task   : LogLevel.getLogger("Task"),
  TaskSet: LogLevel.getLogger("TaskSet"),
};



class File {

  constructor(taskset, path) {
    this.does_exist    = null; // boolean
    this.last_modified = null; // number
    this.made          = false;
    this.make_task     = null;
    this.path          = path;
    this.taskset       = taskset;
  }


  exists() {
    if (typeof this.does_exist !== "boolean") {
      this.getFileData();
    }
    return this.does_exist;
  }


  existsAndIsNewerThan(last_modified) {
    const TIME_DIFF_THRESHOLD = 5; // millis
    return this.exists() && ((this.getLastModified() - last_modified) > TIME_DIFF_THRESHOLD);
  }


  getFileData() { // private
    try {
      const stats = Fs.statSync(this.path, {
        // bigint: true,
      });
      this.does_exist = true;
      this.last_modified = stats.mtimeMs;
      Loggers.File.debug(`File.getFileData(${this.path}) => exists, lm ${this.last_modified}`);
    } catch (e) {
      Loggers.File.debug(`File.getFileData(${this.path}) => does not exist`);
      this.does_exist = false;
    }
  }


  getLastModified() {
    if (typeof this.does_exist !== "boolean") {
      this.getFileData();
    }
    return this.last_modified;
  }


  getMakeTask() {
    if (this.make_task) {
      return this.make_task;
    }
    this.make_task = this.taskset.getTask("file: " + this.path);
    if (!this.make_task) {
      this.taskset.forEachTask((task) => {
        if (!this.make_task && task.targetMatches(this.path)) {
          this.make_task = task;
        }
      });
    }
    Loggers.File.debug(`File.getMakeTask() '${this.path}' has make_task ${this.make_task && this.make_task.name}`);
    return this.make_task;
  }


  getPath() {
    return this.path;
  }


  make(make_stack, counter) {
    const make_task = this.getMakeTask();
    if (!make_task) {
      throw new Error(`File.make(): no task identified to make '${this.path}'`);
    }
    Loggers.File.debug(`File.make() ${this.path} calling make() for ${make_task.name}`);
    return make_task.make(make_stack, counter);
  }


  mustExecute() {
    const make_task = this.getMakeTask();
    return !!make_task && make_task.mustExecute();
  }


  reset() {
    this.does_exist = null; // boolean - force these to be re-obtained when next required
    this.last_modified = null; // number
  }

}


// module.exports = File;

class Task {

  constructor(taskset, name, targets_raw, prereqs_raw, recipe, options) {
    this.options     = options || {};
    this.done        = false;
    this.name        = name;
    this.prereqs_raw = prereqs_raw;
    this.recipe      = recipe;
    this.targets_raw = targets_raw;
    this.taskset     = taskset;
    Loggers.Task.debug(`new Task(${name}, ${targets_raw}, ${prereqs_raw})`);
  }


  desc(str) {
    if (str === undefined) {
      return this.options.description;
    } else if (typeof str !== "string") {
      throw new Error(`Task.desc() argument must be a string, is ${typeof str}`);
    }
    this.options.description = str;
  }


  description(str) {
    this.desc(str);
  }


  execute() {
    if (!this.recipe) {
      Loggers.Task.warn(`Task.execute(): '${this.name}' has no recipe, doing nothing`);
      return;
    }
    if (typeof this.recipe !== "function") {
      throw new Error(`Task.execute(): invalid recipe ${this.recipe} for '${this.name}'`);
    }
    Loggers.Task.warn(`⚒ ${((Date.now() - this.taskset.started_at) / 1000).toFixed(3)}s ${this.name}`);
    const recipeArgs = this.getRecipeArgs();
    return this.recipe(...recipeArgs);
  }


  forEachTarget(callback) {
    if (!this.targets_raw) {
      return;
    }
    if (Array.isArray(this.targets_raw)) {
      this.targets_raw.forEach((array_elem) => callback(array_elem));
    } else if (typeof this.targets_raw === "string") {
      callback(this.targets_raw);
    } else {
      throw new Error(`Task.forEachTarget(): target type not supported at the moment: '${this.name}', ${typeof this.targets_raw}`);
    }
  }


  // null means no targets; 0 means absent target; otherwise is a unix timestamp
  getEarliestTargetLastModified() {
    let out = null;
    this.forEachTarget((target) => {
      const file = this.taskset.getFile(target);
      if (!file.exists()) {
        out = 0;
      } else if ((out === null) || out > file.getLastModified()) {
        out = file.getLastModified();
      }
    });
    return out;
  }


  getLastModified() {
    return this.finished_make_at;
  }


  getMakeTask() {
    return this;
  }


  getName() {
    return this.name;
  }


  getOlderTargetsThan(reference_time) {
    const TIME_DIFF_THRESHOLD = -15; // millis
    const older_targets = [];
    this.forEachTarget((target) => {
      const file = this.taskset.getFile(target);
      file.reset();
      const time_diff = (file.getLastModified() - reference_time);
      Loggers.Task.debug(`Task.getOlderTargets() ${target}, ${file.exists()}, ${this.started_make_at}, ${file.getLastModified()}, ${time_diff}`);
      if (!file.exists() || (time_diff < TIME_DIFF_THRESHOLD)) {
        older_targets.push(`${target} [exists? ${file.exists()}, time diff: ${time_diff}ms]`);
      }
    });
    return older_targets;
  }


  getRecipeArgs() {
    return [ this.targets_raw, this.prereqs_raw, this.name ];
  }


  isCompleted() {
    return this.done;
  }


  make(make_stack, counter, must_execute) {
    make_stack = make_stack || [];
    counter    = counter    || { count: 0 };
    if (make_stack.indexOf(this.name) > -1) {
      throw new Error(`Task.make() '${this.name}' RECURSION, stack: ${make_stack}`);
    }
    if (this.make_promise) {
      return this.make_promise;
    }
    if (this.done) {
      throw new Error(`Task.make() '${this.name}' has already been done`);
    }

    const promises = [];
    this.must_execute = !!must_execute;
    make_stack.push(this.name);
    Loggers.Task.debug(`Task.make() ${this.name}, count: ${counter.count}, make_stack: ${make_stack}`);
    this.taskset.forEachPrereq((task_or_file) => {
      const prereq_task = task_or_file.getMakeTask();
      if (prereq_task) {
        promises.push(task_or_file.make(make_stack.slice(), counter, (task_or_file instanceof Task))); // for each prereq branch
        if (typeof task_or_file.mustExecute() !== "boolean") {
          throw new Error(`Task.make() Task(${task_or_file.name}).mustExecute() not boolean`);
        }
        this.must_execute = this.must_execute || task_or_file.mustExecute();
      }
    }, this.prereqs_raw);

    this.must_execute = this.must_execute || this.needsMaking();
    Loggers.Task.debug(`Task.make() ${this.name}, count: ${counter.count}, executing?: ${this.must_execute}`);

    this.make_promise = Promise.all(promises);
    if (this.must_execute) {
      this.make_promise = this.make_promise
        .then(() => {
          this.started_make_at = Date.now(); // process.hrtime.bigint();
          return this.execute();
        })
        .then(() => {
          counter.count += 1;
          this.markCompleted();
        });
    }
    return this.make_promise;
  }


  markCompleted() {
    const unmade_targets = this.getOlderTargetsThan(this.started_make_at);
    if (unmade_targets.length > 0) {
      throw new Error(`Task.markCompleted() '${this.name}' failed to make targets: ${unmade_targets.join("; ")}`);
    }
    this.finished_make_at = Date.now(); // process.hrtime.bigint();
    this.done = true;
  }


  mustExecute() {
    return this.must_execute;
  }


  needsMaking() {
    if (this.done) {
      return false;
    }
    const earliest_target = this.getEarliestTargetLastModified();
    if (earliest_target === null) {
      return false;
    }
    if (earliest_target === 0) {
      return true;
    }
    let out = false;
    this.taskset.forEachPrereq((task_or_file) => {
      out = out || ((task_or_file instanceof File) && task_or_file.existsAndIsNewerThan(earliest_target));
    }, this.prereqs_raw);
    Loggers.Task.debug(`Task.needsMaking(${earliest_target}) ${this.name} => ${out}`);
    return out;
  }


  reset() {
    this.done = false;
    this.make_promise = null;
    this.must_execute = null;
    this.started_make_at = null;
    this.finished_make_at = null;
  }


  targetMatches(path) {
    if (!this.targets_raw) {
      return false;
    }
    if (typeof this.targets_raw === "string") {
      return (this.targets_raw === path);
    }
    return (this.targets_raw.indexOf(path) > -1);
  }

}


class TaskSet {

  constructor() {
    this.all_files  = {};
    this.all_tasks  = {};
    this.run_status = 0; // 0 = not run yet; 1 = running; 2 = finished
  }


  add(name, targets_raw, prereq_raw, recipe, options) {
    if ((typeof name !== "string" || !name) && (!targets_raw || targets_raw.length === 0)) {
      throw new Error("TaskSet.add(): no task name nor targets");
    }
    // if (name === "build") {
    //   throw new Error("TaskSet.add(): 'build' is not a valid task name any more");
    // }
    if (Array.isArray(targets_raw) && targets_raw.length > 0 && !targets_raw[0]) {
      throw new Error(`TaskSet.add(): invalid first target: ${targets_raw}`);
    }
    if (typeof recipe !== "function") {
      throw new Error("TaskSet.add(): a recipe function is required");
    }
    name = name || "file: " + (
      (typeof targets_raw === "string") ? targets_raw :
        (targets_raw[0] + (
          (targets_raw.length === 2) ? " + 1 other" :
            (targets_raw.length > 2) ? (" + " + (targets_raw.length - 1) + " others") : "")));
    if (this.all_tasks[name]) {
      throw new Error(`TaskSet.add(): task '${name}' already exists`);
    }
    const new_task = new Task(this, name, targets_raw, prereq_raw, recipe, options);
    this.all_tasks[name] = new_task;
    return new_task;
  }


  clear() {
    Loggers.TaskSet.info(`TaskSet.clear()`);
    this.all_files = {};
    this.all_tasks = {};
  }


  forEachPrereq(callback, prereqs_raw) {
    if (!prereqs_raw) { // ignore falsy values
      return;
    }
    if (Array.isArray(prereqs_raw)) {
      prereqs_raw.forEach((array_elem) => this.forEachPrereq(callback, array_elem));
    } else if (typeof prereqs_raw === "string") {
      const task = this.getTask(prereqs_raw);
      if (task) {
        callback(task, prereqs_raw);
      } else {
        const file = this.getFile(prereqs_raw);
        callback(file, prereqs_raw);
      }
    } else {
      throw new Error(`TaskSet.forEachPrereq(): prereq type not supported at the moment: ${typeof prereqs_raw}`);
    }
  }


  forEachTask(callback) {
    Object.keys(this.all_tasks).forEach((task_name) => {
      callback(this.all_tasks[task_name]);
    });
  }


  getFile(path) {
    if (!this.all_files[path]) {
      this.all_files[path] = new File(this, path);
    }
    return this.all_files[path];
  }


  getTask(name) {
    return this.all_tasks[name]; // simple string match
  }


  list() {
    let max_name_length = 0;
    Object.keys(this.all_tasks)
      .forEach((task_name) => {
        max_name_length = Math.max(max_name_length, task_name.length);
      });
    Object.keys(this.all_tasks)
      .sort()
      .forEach((task_name) => {
        console.log(` ${task_name}${" ".repeat(max_name_length - task_name.length + 2)}${this.all_tasks[task_name].options.description || ""}`)
      });
  }

/*
  make(make_stack, counter, must_execute) { // built-in "build" task
    const task_make_promises = [];
    this.forEachTask((task) => {
      if (task.targets_raw && !task.options.exclude_from_build) {
        task_make_promises.push(task.make(make_stack, counter, must_execute));
      }
    });
    return Promise.all(task_make_promises);
  }
*/

  reset() {
    Loggers.TaskSet.info(`TaskSet.reset()`);
    this.all_files = {};
    Object.keys(this.all_tasks).forEach(task_name => this.all_tasks[task_name].reset());
  }


  run(name) {
    if (!name) {
      throw new Error("TaskSet.run(): no target specified to run");
    }
    if (this.run_status === 1) {
      throw new Error("TaskSet.run(): in the middle of a previous exection");
    }
    if (this.run_status === 2) {
      this.reset();
    }

    Loggers.TaskSet.info(`TaskSet.run(${name})...`);

    const makeThing = (thing, must_execute) => {
      this.run_status = 1;
      this.started_at = Date.now();
      const counter = {
        count: 0,
      };
      return thing.make(null, counter, must_execute)
        .then(() => {
          this.run_status = 2;
          return counter.count;
        });
    }

    // if (name === "build") {
    //   Loggers.TaskSet.info(`TaskSet.run(${name}): identified as the build task`);
    //   return makeThing(this);
    // }
    const task = this.getTask(name);
    if (task) {
      Loggers.TaskSet.info(`TaskSet.run(${name}): identified as a task`);
      return makeThing(task, true);
    }
    const file = this.getFile(name);
    if (!file.getMakeTask()) {
      throw new Error(`TaskSet.run(${name}): no task identified to make file`);
    }
    Loggers.TaskSet.info(`TaskSet.run(${name}): identified as a file with a make-task`);
    return makeThing(file);
  }


  which(name) {
    const task = this.getTask(name);
    if (task) {
      console.log(`TaskSet.which(${name}) - identified as a task`);
      console.log(`  targets: ${task.targets_raw}`);
      console.log(`  prereqs: ${task.prereqs_raw}`);
      return;
    }
    const file = this.getFile(name);
    const make_task = file.getMakeTask();
    console.log(`TaskSet.which(${name}) - assumed to be a file whose make-task is: ${make_task.name}`);
  }

}

module.exports = function () {
  return new TaskSet();
};


module.exports.getLoggers = function () {
  return Loggers;
};


module.exports.setLogLevel = function (log_level) {
  Object.keys(Loggers).forEach((logger_name) => {
    Loggers[logger_name].setLevel(log_level);
  });
};
