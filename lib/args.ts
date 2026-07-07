import { z } from "zod";

export const CliArgsSchema = z.object({
  port: z.coerce.number().int().min(0).max(65535).default(0),
  open: z.boolean().default(true),
  help: z.boolean().default(false),
  /** Directory to serve; any path inside the jj workspace works. */
  path: z.string().default("."),
  /** When set, overrides env-based wait-mode auto-detection in index.ts. */
  wait: z.boolean().optional(),
});
export type CliArgs = z.infer<typeof CliArgsSchema>;

export function parseCli(argv: string[]): CliArgs {
  const raw: Record<string, unknown> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--port":
      case "-p":
        raw.port = argv[++i];
        break;
      case "--no-open":
        raw.open = false;
        break;
      case "--wait":
        raw.wait = true;
        break;
      case "--no-wait":
        raw.wait = false;
        break;
      case "--help":
      case "-h":
        raw.help = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown flag: ${arg} (see jiffy --help)`);
        }
        if (raw.path !== undefined) {
          throw new Error(`Unexpected extra argument: ${arg}`);
        }
        raw.path = arg;
    }
  }
  return CliArgsSchema.parse(raw);
}

export function help(): string {
  return `jiffy — local diff reviewer for jj

Usage: jiffy [path] [options]

  path           directory inside a jj workspace (default: cwd)

Options:
  -p, --port N   port to listen on (default: random)
  --no-open      don't open the browser
  --wait         block until the review is finished in the browser:
                 approve → exit 0; request changes → comments are printed
                 to stdout as markdown and jiffy exits 1
  --no-wait      disable wait mode (overrides auto-detection)
  -h, --help     show this help
`;
}
