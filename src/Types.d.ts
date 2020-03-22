
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

export type TaskFunction = (name: string, target: string | string[], prerequisites: string | string[],
                            recipe: RecipeFunction, options?: TaskOptions) => Task;

export declare class Task {
  description: (descr: string) => void;
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

  function basedir(path: string): string;

  function convertSourceToTarget(source_prefix: string, target_prefix: string, from_suffix: string, to_suffix: string): (from: string) => string;

  function convert(regex: RegExp, prefix: string, suffix: string): (from: string) => string;

  function createDir(path: string): void;

  function exec(os_cmd: string, options?: ExecOptions): Promise<void>;

  function execSync(cmd: string, options?: ExecOptions): string[];

  function execSyncLogOutput(cmd: string, options?: ExecOptions): void;

  function getArgs(): any;

  function getBuildFunctions(opts): { exec: ExecFunction, glob: GlobFunction, run: RunFunction, task: TaskFunction };

  function getRelativePath(abs_path: string): string;

  function newTaskSet(): TaskSet;

  function useBuildVars(build_vars_source: string, build_vars_target: string): void;

}
