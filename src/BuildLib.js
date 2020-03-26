
const Chalk    = require("chalk");
const Cp       = require("child_process");
const Fs       = require("fs");
const Glob     = require("glob");
const LogLevel = require("loglevel");
const TaskSet  = require("./TaskSet");
const Yargs    = require("yargs");
const Log      = LogLevel.getLogger("BuildLib");
const build_vars = {};

/*
	to use build vars functionality, e.g. :
	build_vars = {
		source: "src/config/BuildVars.json",
		target: "build/vars.json",
	}
*/


const calcNewSavedVars = () => {
	const env    = Yargs.argv.env;
	const branch = getGitBranch();
	validateBranchName(branch);
	const build_vars_orig = JSON.parse(Fs.readFileSync(build_vars.source, {
		encoding: "utf8",
	}));
	const build_vars_out = {
		env,
		branch,
	};
	Object.keys(build_vars_orig).forEach((param) => {
		build_vars_out[param] = build_vars_orig[param][env];
	});
	if (build_vars_out.domain) {
		build_vars_out.origin = (build_vars_out.protocol || "https") + "://" + build_vars_out.domain;
		if (build_vars_out.port) {
			build_vars_out.origin += ":" + build_vars_out.port;
		}
	}
	if (build_vars_out.path_prefix) {
		build_vars_out.path_prefix = "";
		if ((env === "prod" || env === "nonprod") && (branch !== "master")) {
			build_vars_out.path_prefix += "/branch/" + branch;
		}
	}
	if (build_vars_out.origin) {
		build_vars_out.base_url = build_vars_out.origin + (build_vars_out.path_prefix || "") + "/";
	}
	if (build_vars_out.cache_name) {
		build_vars_out.cache_name = (new Date()).toISOString().replace(/[\:\.]/g, "-");
	}
  return build_vars_out;
};


const getCurrentBuildVars = () => {
  try {
    return JSON.parse(Fs.readFileSync(build_vars.target, {
      encoding: "utf8",
    }));
  } catch (e) {
    // console.error(e);
    return null;
  } // silently ignore ENOENT
};


const getGitBranch = () => {
	return Yargs.argv.branch || module.exports.execSync("git rev-parse --abbrev-ref HEAD")[0];
};


const getOrSetBuildVars = () => {
	const build_vars = getCurrentBuildVars();
	if (build_vars) {
		if (!isClean()) {
			validateExistingVars(build_vars, Yargs.argv.env, getGitBranch());
		}
		Log.warn("using EXISTING vars from build/vars.json: " + JSON.stringify(build_vars));
		Yargs.config(build_vars);
	} else {
		const new_build_vars = calcNewSavedVars();
		writeNewVars(new_build_vars);
		Yargs.config(new_build_vars);
		Log.warn("using NEW vars: " + JSON.stringify(new_build_vars));
	}
};


const getPipelineDataString = (data) => {
	// let str = data.toString();
	// if (str.substr(str.length - 1) === "\n") {
	// 	str = str.substr(0, str.length - 1);
	// }
	// return str;
	return data.toString()
		.split("\n")
		.filter(line => (!!line)) // remove blank lines, incl final newline
		.map((line) => Chalk.gray(line)) // gray-out lines
		.join("\n");
};


let yargv;

const getYargs = () => {
	if (!yargv) {
		Yargs.env("ps_")
			.option("env", {
				choices: [ "dev", "nonprod", "prod" ],
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

		if (build_vars.source) {
			getOrSetBuildVars();
		}
		yargv = Yargs.argv;
	}
	return yargv;
};


const isClean = () => {
	return (Yargs.argv._.indexOf("clean") > -1);
}


const reportErrorAndExit = (error) => {
	console.error(error);
	process.exit(1);
}


const validateBranchName = (branch) => {
  if (!branch) {
    throw new Error(`ERROR branch argument is blank`);
  }
  if (branch.length > 37) {
    // aws_iam_role.lambda_role.name = "${var.app_name}-${var.env}-${var.branch}-lambda-role"
    // and this MUST BE <= 64 chars; hence for brazil-nonprod, that leaves 37 left for the branch name
    throw new Error(`ERROR branch name MUST NOT be > 37 characters: ${branch}`);
  }
  if (branch.match(/[^a-z0-9-]/)) {
    throw new Error(`ERROR branch name MUST ONLY contain lowercase alphanumeric and dash characters: ${branch}`);
  }
};


const validateExistingVars = (data, env, branch) => {
  if (data.env !== env) {
    throw new Error(`${build_vars.target} exists, ERROR env is different: ${env} <> ${data.env}`);
  }
  if (data.branch !== branch) {
    throw new Error(`${build_vars.target} exists, WARNING branch is different: ${branch} <> ${data.branch}`);
  }
};


const writeNewVars = (data) => {
	module.exports.createDir(build_vars.target);
  const out = JSON.stringify(data, null, 2) + "\n";
  Fs.writeFileSync(build_vars.target, out); // pretty-print with 2-space indent
};


// exports

module.exports.basedir = (path) => {
	return path.substr(0, path.lastIndexOf("/"));
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


const dirs_created = {};


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
  return Cp.execSync(cmd, options).split("\n");
};


module.exports.execSyncLogOutput = function (cmd, options) {
	module.exports.execSync(cmd, options)
		.filter((line, index) => !!line || (index > 0))
		.forEach((line) => Log.info(line));
};


module.exports.getArgs = function () {
	return getYargs();
};


module.exports.getBuildFunctions = function (opts) {
	if (opts && opts.build_vars_source) {
		module.exports.useBuildVars(opts.build_vars_source, opts.build_vars_target);
	}
	// const out = new Promake();
	const yargv = getYargs();
	const target = yargv._ && (yargv._.length > 0) && yargv._[0] || null;
	const taskset = TaskSet();

	Log.setLevel(yargv.loglevel);
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
	out.exec = module.exports.exec;
	out.glob = Glob.sync;
	// out.rule = Task.addRule;
	out.task = taskset.add.bind(taskset);
	return out;
};


module.exports.getRelativePath = (abs_path) => {
  if (abs_path.indexOf(process.cwd()) !== 0) {
    throw new Error(`${abs_path} doesn't seem to be an absolute path, based on cwd ${process.cwd()}`);
  }
  return abs_path.substr(process.cwd().length + 1);
};


module.exports.newTaskSet = TaskSet;


module.exports.useBuildVars = (build_vars_source, build_vars_target) => {
	build_vars.source = build_vars_source;
	build_vars.target = build_vars_target;
};


module.exports.versionClick = (version_level) => {
	const version_level_labels = [ "major", "minor", "patch" ];
	const version_level_index  = version_level_labels.indexOf(version_level);
	if (version_level_index === -1) {
		throw new Error(`version_level MUST be one of: major, minor, OR patch; not ${version_level}`);
	}
	const package_data = JSON.parse(Fs.readFileSync("package.json", {
		encoding: "utf8",
	}));
	const version_split = package_data.version && /^(\d+)\.(\d+)\.(\d+)$/.exec(package_data.version);
	if (!version_split || version_split.length < 4) {
		throw new Error(`missing or invalid version number in package.json, MUST be n.n.n, not ${package_data.version}`);
	}
	const version_new = [ parseInt(version_split[1], 10), parseInt(version_split[2], 10), parseInt(version_split[3], 10) ];
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
	Cp.execSync(`git commit -a -m "${version_level} version click to: ${version_new_str}"`);
	Cp.execSync(`git tag ${version_new_str}`);
	Cp.execSync(`git push --tags`);
	if (package_data.ultimake_settings && package_data.ultimake_settings.exec_on_version_click) {
		Cp.execSync(package_data.ultimake_settings.exec_on_version_click);
	}
}
