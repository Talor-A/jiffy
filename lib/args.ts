import { z } from "zod";

export const CliArgsSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(5959),
  open: z.boolean().default(true),
  help: z.boolean().default(false),
  /** Directory to serve; any path inside the jj workspace works. */
  path: z.string().default("."),
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
  -p, --port N   port to listen on (default: 5959)
  --no-open      don't open the browser
  -h, --help     show this help
`;
}
