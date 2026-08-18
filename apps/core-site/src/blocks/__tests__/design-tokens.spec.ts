import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const blocksDirectory = resolve(__dirname, '..');
const siteStyles = readFileSync(resolve(blocksDirectory, '../styles/site.scss'), 'utf8');

/** Все значения токена в порядке объявления: базовое, затем оверрайды брейкпоинтов. */
function remValues(token: string): number[] {
  return [...siteStyles.matchAll(new RegExp(`--${token}:\\s*([0-9.]+)rem`, 'g'))].map((match) =>
    Number(match[1] ?? Number.NaN)
  );
}

/** Базовое (мобильное) значение токена. */
function baseValue(token: string): number {
  const values = remValues(token);
  expect(values.length).toBeGreaterThan(0);

  return values[0] ?? Number.NaN;
}

/** Границы clamp: минимум для мобайла и максимум для широкого экрана. */
function clampBounds(token: string): readonly [number, number] {
  const match = new RegExp(`--${token}:\\s*clamp\\(([0-9.]+)rem,[^,]+,\\s*([0-9.]+)rem\\)`).exec(
    siteStyles
  );
  expect(match).not.toBeNull();

  return [Number(match?.[1] ?? Number.NaN), Number(match?.[2] ?? Number.NaN)];
}

function moduleFiles(): ReadonlyArray<readonly [string, string]> {
  return readdirSync(blocksDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '__tests__')
    .flatMap((entry) =>
      readdirSync(resolve(blocksDirectory, entry.name))
        .filter((file) => file.endsWith('.module.scss'))
        .map(
          (file) =>
            [
              `${entry.name}/${file}`,
              readFileSync(resolve(blocksDirectory, entry.name, file), 'utf8')
            ] as const
        )
    );
}

/**
 * Ритм и типографика — измеримые правила, а не вкусовщина. Их место в токенах:
 * иначе каждый следующий блок заводит свои отступы и шкала расползается.
 */
describe('site rhythm tokens', () => {
  it('keeps the mobile section rhythm between 56 and 80 pixels', () => {
    for (const token of ['site-section-space-sm', 'site-section-space', 'site-section-space-lg']) {
      const mobile = baseValue(token);

      expect(mobile).toBeGreaterThanOrEqual(3.5);
      expect(mobile).toBeLessThanOrEqual(5);
    }
  });

  it('keeps the desktop section rhythm between 96 and 160 pixels', () => {
    for (const token of ['site-section-space-sm', 'site-section-space', 'site-section-space-lg']) {
      const [, ...desktop] = remValues(token);

      expect(desktop.length).toBeGreaterThan(0);
      for (const step of desktop) {
        expect(step).toBeGreaterThanOrEqual(6);
        expect(step).toBeLessThanOrEqual(10);
      }
    }
  });

  it('scales the rhythm steps in one direction', () => {
    const small = baseValue('site-section-space-sm');
    const medium = baseValue('site-section-space');
    const large = baseValue('site-section-space-lg');

    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });
});

describe('site typography tokens', () => {
  it('gives a section heading 36 to 56 pixels', () => {
    const [min, max] = clampBounds('site-font-size-section');

    expect(min).toBeGreaterThanOrEqual(2.25);
    expect(max).toBeLessThanOrEqual(3.5);
    expect(max).toBeGreaterThan(min);
  });

  it('keeps the heading at least twice the body size', () => {
    const [, headingMax] = clampBounds('site-font-size-section');
    const leadMax = Math.max(...remValues('site-font-size-lead'));

    expect(baseValue('site-font-size-body')).toBe(1);
    expect(leadMax).toBeLessThanOrEqual(1.125 * 1.2);
    expect(headingMax / leadMax).toBeGreaterThanOrEqual(2);
  });

  it('sets a denser weight and tracking for headings', () => {
    expect(siteStyles).toContain('--site-font-weight-heading: 700');
    expect(siteStyles).toMatch(/--site-tracking-heading:\s*-0?\.0\d+em/);
  });
});

describe('block modules', () => {
  it('takes every section rhythm from the scale instead of a local number', () => {
    for (const [name, css] of moduleFiles()) {
      for (const declaration of css.match(/padding:[^;]*var\\(--site-gutter\\)/g) ?? []) {
        expect(`${name}: ${declaration}`).toContain('var(--site-section-space');
      }
    }
  });

  it('takes every heading size from the typographic scale', () => {
    for (const [name, css] of moduleFiles()) {
      expect(`${name}: ${css.includes('clamp(') ? 'own type scale' : 'scale tokens'}`).toContain(
        'scale tokens'
      );
    }
  });
});
