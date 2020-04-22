
const Chalk    = require("chalk");
const Cp       = require("child_process");
const Fs       = require("fs");
const Glob     = require("glob");
const LogLevel = require("loglevel");
const TaskSet  = require("./TaskSet");
const Yargs    = require("yargs");
const Log      = LogLevel.getLogger("main");

let allowed_envs = [ "dev", "nonprod", "prod" ];
let branch_validation_prefix = /^[a-z0-9-]{4,37}$/;
let build_vars_added = false;
let build_vars_file = null;
const dirs_created = {};
let yargv;
let yargs_env_vars_prefix = "um_";


Yargs.env(yargs_env_vars_prefix)
	.option("env", {
		choices: allowed_envs,
		demandOption: false,
		default: "dev",
		type: "string"
	})
	.option("branch", {
		demandOption: false,
		type: "string"
	})
	.option("loglevel", {
		default: "WARN",
		choices: [ "SILENT", "ERROR", "WARN", "INFO", "DEBUG", "TRACE" ],
		description: "amount of logging output to show",
	})
	.option("t", {
		boolean: true,
		description: "show all tasks",
	})
	.option("w", {
		boolean: true,
		description: "show information about task or file",
	})
	.argv;

yargv = Yargs.argv;


const getPipelineDataString = (data) => {
	return data.toString()
		.split("\n")
		.filter(line => (!!line)) // remove blank lines, incl final newline
		.map((line) => Chalk.gray(line)) // gray-out lines
		.join("\n");
};


const getYargs = () => {
	if (build_vars_file && !build_vars_added) {
		const build_vars = module.exports.getJSONFileData(build_vars_file);
		module.exports.validateExistingVars(build_vars, yargv.env, yargv.branch || module.exports.getGitBranch());
		Log.warn("using EXISTING vars from build/vars.json: " + JSON.stringify(build_vars));
		Yargs.config(build_vars);
		yargv = Yargs.argv;
		build_vars_added = true;
	}
	return yargv;
};


const reportErrorAndExit = (error) => {
	console.error(error);
	process.exit(1);
}


// exports

module.exports.basedir = (path) => {
	return path.substr(0, path.lastIndexOf("/"));
};


module.exports.calcBuildVarsFromEnv = (build_vars_orig, env) => {
	const build_vars_out = {
		env,
	};
	Object.keys(build_vars_orig).forEach((param) => {
		build_vars_out[param] = build_vars_orig[param][env];
	});
	return build_vars_out;
};


module.exports.calcPathBuildVars = (build_vars) => {
	if (build_vars.origin === "set-in-build") {
		build_vars.origin = (build_vars.protocol || "https") + "://" + build_vars.domain;
		if (build_vars.port) {
			build_vars.origin += ":" + build_vars.port;
		}
	}
	if (build_vars.path_prefix === "set-in-build") {
		build_vars.path_prefix = "";
		if ((build_vars.env === "prod" || build_vars.env === "nonprod") && build_vars.branch && (build_vars.branch !== "master")) {
			build_vars.path_prefix += "/branch/" + build_vars.branch;
		}
	}
	if (build_vars.base_url === "set-in-build") {
		build_vars.base_url = build_vars.origin + (build_vars.path_prefix || "") + "/";
	}
	if (build_vars.cache_name === "set-in-build") {
		build_vars.cache_name = (new Date()).toISOString().replace(/[\:\.]/g, "-");
	}
};


module.exports.convertSourceToTarget = (source_prefix, target_prefix, from_suffix, to_suffix) => {
	return module.exports.convert(
		new RegExp("^" + source_prefix + "(/.*)" + from_suffix + "$"),
		target_prefix,
		to_suffix);
};


module.exports.convert = (regex, prefix, suffix) => {
  return function(from) {
    const match = regex.exec(from);
    if (!match || match.length < 2) {
      throw new Error(`convert() failed with ${regex} on ${from}`);
    }
    return (prefix + match[1] + suffix);
  };
};


module.exports.createBuildVarsFile = (build_vars_source_file) => {
	if (!build_vars_file) {
		throw new Error(`setBuildVarsFile() not called - required to define the Build Vars file location`);
	}
	if ((typeof build_vars_source_file !== "string") || !build_vars_source_file) {
		throw new Error(`setBuildVarsFile() source file must be a non-blank string`);
	}
	if (build_vars_added) {
		throw new Error(`getArgs() already called`);
	}
	const build_vars_orig = module.exports.getJSONFileData(build_vars_source_file);
	const build_vars_new  = module.exports.calcBuildVarsFromEnv(build_vars_orig, yargv.env);
	build_vars_new.branch = yargv.branch || module.exports.getGitBranch();
	module.exports.calcPathBuildVars(build_vars_new);
	module.exports.validateBranchName(build_vars_new.branch);
	module.exports.writeBuildVars(build_vars_file, build_vars_new);
	Log.warn("using NEW vars: " + JSON.stringify(build_vars_new));
};


module.exports.createDir = (path) => {
	const dir = module.exports.basedir(path);
	if (!dirs_created[dir]) {
		Log.debug(`making new dir for path: ${path}`);
		module.exports.execSync(`mkdir -p ${dir}`);
		dirs_created[dir] = true;
	}
};


module.exports.exec = function (os_cmd, options) {
	options = options || {};
	options.encoding = options.encoding || "utf8";
	Log.debug(`running os command: ${os_cmd}`);
	const temp = new Error();
	const stack = temp.stack.split("\n");
	const src_line = stack.length > 2 && stack[2] && stack[2].substr(29);

	return new Promise((resolve, reject) => {
		const proc = Cp.exec(os_cmd, options);
		proc.stdout.on("data", (data) => {
			Log.info(getPipelineDataString(data));
		});
		proc.stderr.on("data", (data) => {
			Log.error(getPipelineDataString(data));
		});
		proc.on("exit", (code) => {
			// console.log(`Child exited with code ${code}`);
			if (code === 0) {
				resolve();
			} else {
				reject(`error: ${code}, from: '${os_cmd}', at: ${src_line}`);
			}
		});
	});
};


module.exports.execSync = function (cmd, options) {
	options = options || {};
	options.encoding = options.encoding || "utf8";
	options.stdio = ['inherit', 'inherit', 'inherit']; // connect stdin, stdout and stderr to parent process
  Cp.execSync(cmd, options);
};


module.exports.execSyncToArray = function (cmd, options) {
	options = options || {};
	options.encoding = options.encoding || "utf8";
  return Cp.execSync(cmd, options).split("\n");
};


module.exports.execSyncLogOutput = function (cmd, options) {
	module.exports.execSyncToArray(cmd, options)
		.filter((line, index) => !!line || (index > 0))
		.forEach((line) => Log.info(line));
};


module.exports.getArgs = function () {
	return getYargs();
};


module.exports.getBuildFunctions = function () {
	// const out = new Promake();
	// const yargv = getYargs();
	const target = module.exports.getTarget();
	const taskset = TaskSet();

	Log    .setLevel(yargv.loglevel);
	TaskSet.setLogLevel(yargv.loglevel);

	const out = {};
	out.run = async () => {
		if (yargv.t) {
			taskset.list();
		} else if (yargv.w) {
			taskset.which(target);
		} else if (target) {
			taskset.run(target)
				.catch((error) => {
					reportErrorAndExit(error);
				});

		} else {
			reportErrorAndExit(`no make target specified`);
		}
	};
	out.desc = () => {
		throw new Error("use Task.desc()");
	};
	out.exec = module.exports.exec; // deprecated - use module.exports.exec*
	out.glob = Glob.sync; // deprecated - use module.exports.glob
	// out.rule = Task.addRule;
	out.task = taskset.add.bind(taskset);
	return out;
};


module.exports.getGitBranch = () => {
	return module.exports.execSyncToArray("git rev-parse --abbrev-ref HEAD")[0];
};


module.exports.getJSONFileData = (json_file) => {
	return JSON.parse(Fs.readFileSync(json_file, {
		encoding: "utf8",
	}));
};


module.exports.getRelativePath = (abs_path) => {
  if (abs_path.indexOf(process.cwd()) !== 0) {
    throw new Error(`${abs_path} doesn't seem to be an absolute path, based on cwd ${process.cwd()}`);
  }
  return abs_path.substr(process.cwd().length + 1);
};


module.exports.getTarget = () => {
	return yargv._ && (yargv._.length > 0) && yargv._[0] || null;
};


module.exports.gitCommitAndPush = (commit_msg) => {
	Cp.execSync(`git commit -a -m "${commit_msg}"`);
	Cp.execSync(`git push`);
};


module.exports.gitIsClean = () => {
	const out = module.exports.execSyncToArray("git status");
	return out && out.reduce((prev, line) => prev || (line === "nothing to commit, working tree clean"), false);
};


module.exports.gitTagAndPush = (version_new_str) => {
	Cp.execSync(`git tag ${version_new_str}`);
	Cp.execSync(`git push --tags`);
};


module.exports.glob = Glob.sync;


module.exports.newTaskSet = TaskSet;


module.exports.setAllowedEnvs = (new_array) => {
	allowed_envs = new_array;
};


module.exports.setBranchValidationRegExp = (new_regexp) => {
	branch_validation_prefix = new_regexp;
};


module.exports.setBuildVarsFile = (arg) => {
	build_vars_file = arg;
};


module.exports.setEnvVarsPrefix = (new_prefix) => {
	yargs_env_vars_prefix = new_prefix;
};


module.exports.validateBranchName = (branch) => {
	if (!branch_validation_prefix) {
		return;
	}
  if (!branch_validation_prefix.exec(branch)) {
    throw new Error(`ERROR branch name ${branch} is invalid`);
  }
};


module.exports.validateExistingVars = (data, env, branch) => {
  if (data.env !== env) {
    throw new Error(`${build_vars_file} exists, ERROR env is different: ${env} <> ${data.env}`);
  }
  if (data.branch !== branch) {
    throw new Error(`${build_vars_file} exists, WARNING branch is different: ${branch} <> ${data.branch}`);
  }
};


module.exports.versionClick = (version_level) => {
	if (!module.exports.gitIsClean()) {
		throw new Error("uncommitted changes present, please tidy up first");
	}
	const version_level_labels = [ "major", "minor", "patch" ];
	const version_level_index  = version_level_labels.indexOf(version_level);
	if (version_level_index === -1) {
		throw new Error(`version_level MUST be one of: major, minor, OR patch; not ${version_level}`);
	}
	const package_data = module.exports.getJSONFileData("package.json");
	const version_split = package_data.version && /^(\d+)\.(\d+)\.(\d+)$/.exec(package_data.version);
	if (!version_split || version_split.length < 4) {
		throw new Error(`missing or invalid version number in package.json, MUST be n.n.n, not ${package_data.version}`);
	}
	const version_new = [
		parseInt(version_split[1], 10),
		parseInt(version_split[2], 10),
		parseInt(version_split[3], 10),
	];
	version_new[version_level_index] += 1;
	if (version_level_index < 2) {
		version_new[2] = 0;
	}
	if (version_level_index < 1) {
		version_new[1] = 0;
	}
	const version_new_str = version_new.join(".");
	console.log(`setting version number to: ${version_new_str}`);
	package_data.version = version_new_str;
	Fs.writeFileSync("package.json", JSON.stringify(package_data, null, 2) + "\n", {
		encoding: "utf8",
	});
	Cp.execSync(`npm install`); // update version number in package-lock.json
	const commit_msg = `${version_level} version click to: ${version_new_str}`;
	module.exports.gitCommitAndPush(commit_msg);
	module.exports.gitTagAndPush(version_new_str);
	if (package_data.ultimake_settings && package_data.ultimake_settings.exec_on_version_click) {
		Cp.execSync(package_data.ultimake_settings.exec_on_version_click);
	}
};


module.exports.writeBuildVars = (build_vars_file, data) => {
	module.exports.createDir(build_vars_file);
  const out = JSON.stringify(data, null, 2) + "\n";
  Fs.writeFileSync(build_vars_file, out); // pretty-print with 2-space indent
};
