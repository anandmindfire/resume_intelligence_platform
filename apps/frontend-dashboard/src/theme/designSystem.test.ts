import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import tokens from './tokens.json';
import { CHART_COLORS, STATUS_COLORS } from '../constants';
import { baseColors, chartColors, colorScales } from './index';

// Vitest injects __dirname; it stays correct whether tests run from the app dir or the repo root.
const srcDir = path.resolve(__dirname, '..');
const appDir = path.resolve(srcDir, '..');

/** Every non-test source file whose text could contain a color. */
function sourceFiles(dir: string = srcDir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const isSource = /\.(ts|tsx|css)$/.test(entry.name);
    const isTest = /\.test\.(ts|tsx)$/.test(entry.name);
    return isSource && !isTest ? [full] : [];
  });
}

const relative = (file: string) => path.relative(appDir, file);

/** Lines of `file` matching `pattern`, as "path:line: text" for readable failures. */
function offenders(pattern: RegExp): string[] {
  return sourceFiles().flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        pattern.test(line) ? [`${relative(file)}:${index + 1}: ${line.trim()}`] : []
      )
  );
}

describe('design system', () => {
  it('has no hex / rgb / hsl color literals outside src/theme/tokens.json', () => {
    expect(offenders(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/)).toEqual([]);
  });

  it('has no Tailwind default-palette utilities (use semantic tokens: neutral, success, warning, danger, info, accent)', () => {
    // Tailwind's `neutral` palette is intentionally absent: `neutral` is our own token name.
    const palettes =
      'slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
    expect(offenders(new RegExp(`[a-z]-(?:${palettes})-\\d{2,3}\\b`))).toEqual([]);
  });

  describe('tailwind.config.js', () => {
    const config = createRequire(path.join(appDir, 'package.json'))('./tailwind.config.js') as {
      theme: { colors: Record<string, unknown> };
    };

    it('replaces Tailwind’s default palette instead of extending it', () => {
      const names = Object.keys(config.theme.colors);
      for (const forbidden of [
        'gray',
        'red',
        'green',
        'blue',
        'yellow',
        'amber',
        'purple',
        'slate',
      ]) {
        expect(names).not.toContain(forbidden);
      }
    });

    it('exposes exactly the design tokens (plus transparent/current/inherit)', () => {
      const names = Object.keys(config.theme.colors).sort();
      const expected = [
        'transparent',
        'current',
        'inherit',
        ...Object.keys(tokens.base),
        ...Object.keys(tokens.colors),
      ].sort();
      expect(names).toEqual(expected);
    });
  });

  describe('chart colors', () => {
    const allowed = new Set<string>([...Object.values(chartColors), ...Object.values(baseColors)]);

    it('series colors come from the chart tokens', () => {
      for (const color of CHART_COLORS) expect(allowed.has(color)).toBe(true);
    });

    it('status colors come from the chart tokens', () => {
      for (const color of Object.values(STATUS_COLORS)) expect(allowed.has(color)).toBe(true);
    });

    it('series colors are distinct so categories stay distinguishable', () => {
      expect(new Set(CHART_COLORS).size).toBe(CHART_COLORS.length);
    });
  });

  it('every semantic scale is complete (50-900) so any shade a component asks for exists', () => {
    const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    for (const name of [
      'primary',
      'secondary',
      'neutral',
      'success',
      'warning',
      'danger',
      'info',
      'accent',
    ] as const) {
      expect(Object.keys(colorScales[name])).toEqual(expect.arrayContaining(shades));
    }
  });
});
