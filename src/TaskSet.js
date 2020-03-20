
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


  getFileData() { // private
    try {
      const stats = Fs.statSync(this.path);
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
    this.make_task = this.taskset.getTask("rule: " + this.path);
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
      throw new Error(`no task identified to make '${this.path}'`);
    }
    this.does_exist = null; // boolean - force these to be re-obtained when next required
    this.last_modified = null; // number
    Loggers.File.debug(`File.make() ${this.path} calling make() for ${make_task.name}`);
    return make_task.make(make_stack, counter);
  }


  // a File should be made if: (a) it doesn't exist, or (b) it is older than its dependencies, as defined by its make_task
  needsMaking() {
    let out = false;
    if (!this.exists()) {
      out = true;
    } else {
      const make_task = this.getMakeTask();
      if (make_task && !this.made) {
        out = !make_task.isMoreRecentThanAnyPrerequisites(this.last_modified);
      }
    }
    Loggers.File.info(`File.needsMaking() '${this.path}', exists? ${this.exists()}, lm? ${this.last_modified} => ${out}`);
    return out;
  }

}


// module.exports = File;

class Task {

  constructor(taskset, name, targets_raw, prereqs_raw, recipe, options) {
    this.descr       = options && options.description;
    this.done        = false;
    this.name        = name;
    this.prereqs_raw = prereqs_raw;
    this.recipe      = recipe;
    this.targets_raw = targets_raw;
    this.taskset     = taskset;
    Loggers.Task.info(`new Task(${name}, ${targets_raw}, ${prereqs_raw})`);
  }


  desc(str) {
    this.descr = str;
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
    Loggers.Task.warn(`⚒ +${((Date.now() - this.taskset.started_at) / 1000).toFixed(3)}s ${this.name}`);
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


  getLastModified() {
    return this.finished_make_at;
  }


  getMakeTask() {
    return this;
  }


  getName() {
    return this.name;
  }


  getRecipeArgs() {
    return [ this.targets_raw, this.prereqs_raw, this.name ];
  }


  isCompleted() {
    return this.done;
  }


  isMoreRecentThanAnyPrerequisites(last_modified) {
    const TIME_DIFF_THRESHOLD = -5; // millis
    let out = true;
    this.taskset.forEachPrereq((task_or_file) => {
      out = out && ((last_modified - task_or_file.getLastModified()) > TIME_DIFF_THRESHOLD);
      Loggers.Task.debug(`Task.isMoreRecentThanAnyPrerequisites(${last_modified}) ${this.name} ? ${task_or_file.getLastModified()} => ${out}`);
    }, this.prereqs_raw);
    return out;
  }


  make(make_stack, counter) {
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
    this.make_promise = Promise.resolve()
      .then(() => {
        const promises = [];
        this.started_make_at = Date.now();
        make_stack.push(this.name);
        Loggers.Task.debug(`Task.make() make_stack: ${make_stack}`);
        Loggers.Task.info(`Task.make() ${this.name}`);
        this.taskset.forEachPrereq((task_or_file) => {
          if (task_or_file.needsMaking()) { // use slice() to shallow-copy the make_stack array
            promises.push(task_or_file.make(make_stack.slice(), counter)); // for each prereq branch
          }
        }, this.prereqs_raw);
        return Promise.all(promises);
      })
      .then(() => {
        return this.execute();
      })
      .then(() => {
        counter.count += 1;
        this.markCompleted();
      });
    return this.make_promise;
  }


  markCompleted() {
    const TIME_DIFF_THRESHOLD = -15; // millis
    const unmade_targets = [];
    this.forEachTarget((target) => {
      const file = this.taskset.getFile(target);
      file.getFileData();
      Loggers.Task.debug(`Task.markCompleted() ${target}, ${file.exists()}, ${this.started_make_at}, ${file.getLastModified()}, ${this.started_make_at - file.getLastModified()}`);
      const time_diff = (file.getLastModified() - this.started_make_at);
      if (!file.exists() || (time_diff < TIME_DIFF_THRESHOLD)) {
        unmade_targets.push(`${target}, exists? ${file.exists()}, time diff? ${time_diff}s`);
      }
    });
    if (unmade_targets.length > 0) {
      throw new Error(`Task.markCompleted() '${this.name}' failed to make targets: ${unmade_targets.join("; ")}`);
    }
    this.finished_make_at = Date.now();
    this.done = true;
  }


  needsMaking() {
    return !this.isCompleted();
  }


  reset() {
    this.done = false;
    this.make_promise = null;
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
    if (Array.isArray(targets_raw) && targets_raw.length > 0 && !targets_raw[0]) {
      throw new Error(`TaskSet.add(): invalid first target: ${targets_raw}`);
    }
    if (typeof recipe !== "function") {
      throw new Error("TaskSet.add(): a recipe function is required");
    }
    name = name || "rule: " + (
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
        console.log(` ${task_name}${" ".repeat(max_name_length - task_name.length + 2)}${this.all_tasks[task_name].descr || ""}`)
      })
  }


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

    const makeThing = (thing) => {
      this.run_status = 1;
      this.started_at = Date.now();
      const counter = {
        count: 0,
      };
      return thing.make(null, counter)
        .then((count) => {
          this.run_status = 2;
          return counter.count;
        });
    }

    const task = this.getTask(name);
    if (task) {
      Loggers.TaskSet.info(`TaskSet.run(${name}) - identified as a task`);
      return makeThing(task);
    }
    const file = this.getFile(name);
    if (file.needsMaking()) {
      Loggers.TaskSet.info(`TaskSet.run(${name}) - assumed to be a file that needs making`);
      return makeThing(file);
    } else {
      Loggers.TaskSet.info(`TaskSet.run(${name}) - assumed to be a file that does not need making`);
      return Promise.resolve(0);
    }
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
