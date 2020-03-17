
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

export type TaskFunction = (name: string, target: string | string[], prerequisites?: string | string[],
                            recipe: RecipeFunction, options?: TaskOptions) => Task;

export declare class Task {
  description: (descr: string) => void;
}
