
import {
  ChildProcess,
  SpawnOptions,
  ExecOptions,
  ExecFileOptions,
  ForkOptions,
} from "child_process";

interface Output {
  stdout?: string | Buffer | null | undefined;
  stderr?: string | Buffer | null | undefined;
}

type ChildProcessPromise = ChildProcess & Promise<Output>;

type RecipeFunction = (targets: string | string[], prereqs: string | string[], name: string) => Promise<any>;

type TaskOptions = {
  description: string;
};

export type ExecFunction = (command: string, options?: ExecOptions) => Promise<void>;

export type GlobFunction = (pattern: string, options?: any) => string[];

export type  RunFunction = () => void;

export type TaskFunction = (name: string, target: string | string[], prerequisites: string | (string | string[])[],
                            recipe: RecipeFunction, options?: TaskOptions) => Task;

export type VersionLevel = "major" | "minor" | "patch";

export declare class Task {

  desc: (descr: string) => string;

  description: (descr: string) => string;

}

export declare class TaskSet {

  public add: TaskFunction;

  public clear(): void; // remove all added tasks

  public getTask(name: string): Task;

  public list(): void; // output list of available tasks to console.log

  public run: RunFunction;

  public which(name: string): void; // show targets and prereqs of named task, or task of named file

}


declare module "ultimake" {

  export function basedir(path: string): string;

  export function calcBuildVarsFromEnv(build_vars_orig: any, env: string): any;

  export function calcPathBuildVars(build_vars: any): void;

  export function convertSourceToTarget(source_prefix: string, target_prefix: string, from_suffix: string, to_suffix: string): (from: string) => string;

  export function convert(regex: RegExp, prefix: string, suffix: string): (from: string) => string;

  export function createBuildVarsFile(build_vars_source_file: string): void;

  export function createDir(path: string): void;

  export function exec(os_cmd: string, options?: ExecOptions): Promise<void>;

  export function execSync(cmd: string, options?: ExecOptions): void;

  export function execSyncToArray(cmd: string, options?: ExecOptions): string[];

  export function execSyncLogOutput(cmd: string, options?: ExecOptions): void;

  export function getArgs(): any;

  export function getBuildFunctions(): { exec: ExecFunction, glob: GlobFunction, run: RunFunction, task: TaskFunction };

  export function getGitBranch(): string;

  export function getJSONFileData(json_file: string): any;

  export function getRelativePath(abs_path: string): string;

  export function getTarget(): string;

  export function gitCommitAndPush(commit_msg: string): void;

  export function gitIsClean(): boolean;

  export function gitTagAndPush(version_new_str: string): void;

  export function glob(pattern: string): string[];

  export function newTaskSet(): TaskSet;

  export function setAllowedEnvs(new_array: string[]): void;

  export function setBranchValidationRegExp(new_regexp: RegExp): void;

  export function setBuildVarsFile(arg: string): void;

  export function setEnvVarsPrefix(new_prefix: string): void;

  export function validateBranchName(branch: string): void;

  export function validateExistingVars(data: any, env: string, branch: string): void;

  export function versionClick(version_level: VersionLevel): void;

  export function writeBuildVars(build_vars_file: string, data: any): void;

}
