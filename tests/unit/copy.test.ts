// House style: no em dashes anywhere players can see.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

describe('copy', () => {
  it('has no em dashes', () => {
    const offenders = [...files(join(root, 'src')), join(root, 'index.html')].filter((f) =>
      readFileSync(f, 'utf8').includes('—'),
    );
    expect(offenders).toEqual([]);
  });
});
