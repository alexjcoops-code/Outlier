// Just enough of the Deno runtime for `npm run typecheck` to cover the Edge
// Functions under Node's TypeScript. Deno itself ignores this file.
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: { get(name: string): string | undefined };
}
