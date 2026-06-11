import type { z } from "zod";

export class CommandError extends Error {
  constructor(
    readonly argv: string[],
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(
      `Command failed (${exitCode}): ${argv.join(" ")}\n${stderr.trim() || stdout.trim()}`,
    );
    this.name = "CommandError";
  }
}

/**
 * Run a command from an argv array — never through a shell, so arguments
 * (revsets, descriptions, file paths) need no quoting or escaping.
 */
export async function run(argv: string[], cwd: string): Promise<string> {
  const [cmd, ...rest] = argv;
  if (!cmd) throw new Error("run: empty argv");
  const proc = Bun.spawn([cmd, ...rest], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new CommandError(argv, exitCode, stdout, stderr);
  return stdout;
}

/** Run a command and parse its stdout as JSON validated by `schema`. */
export async function runToSchema<T>(
  schema: z.ZodType<T>,
  argv: string[],
  cwd: string,
): Promise<T> {
  const stdout = await run(argv, cwd);
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (e) {
    throw new Error(
      `Expected JSON from \`${argv.join(" ")}\`: ${(e as Error).message}`,
    );
  }
  return schema.parse(value);
}

export async function succeeds(argv: string[], cwd: string): Promise<boolean> {
  try {
    await run(argv, cwd);
    return true;
  } catch {
    return false;
  }
}
