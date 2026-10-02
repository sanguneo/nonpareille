/** Contract every CLI command module under cli/commands/<name>.ts must export. */
export interface CommandModule {
  /** One-line description shown by `dot --help`. */
  summary: string;
  /** Usage text shown by `dot <name> --help`. */
  usage: string;
  /** Runs the command; resolves to the process exit code (0 ok, 2 input error, 3 provider error). */
  run(argv: string[]): Promise<number>;
}
