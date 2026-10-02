/** Minimal argv parser shared by all CLI commands. */
export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | true>;
}

/** Parses `--key value`, `--key=value`, `--flag` (boolean when next token starts with -- or is absent), `-o value`. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        flags.set(a.slice(2, eq), a.slice(eq + 1));
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(a.slice(2), next);
        i++;
      } else {
        flags.set(a.slice(2), true);
      }
    } else if (a === "-o" && argv[i + 1] !== undefined) {
      flags.set("out", argv[i + 1] as string);
      i++;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function flagStr(a: ParsedArgs, key: string): string | undefined {
  const v = a.flags.get(key);
  return typeof v === "string" ? v : undefined;
}

export function flagNum(a: ParsedArgs, key: string): number | undefined {
  const v = flagStr(a, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number, got "${v}"`);
  return n;
}

export function flagBool(a: ParsedArgs, key: string): boolean {
  return a.flags.has(key);
}

/** Parses "WxH" such as "32x32". */
export function parseSize(s: string): [number, number] {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) throw new Error(`size must look like 32x32, got "${s}"`);
  return [Number(m[1]), Number(m[2])];
}
