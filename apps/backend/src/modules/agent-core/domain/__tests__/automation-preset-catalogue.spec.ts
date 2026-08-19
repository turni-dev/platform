import { describe, expect, it } from 'vitest';
import { AutomationAllowlistSchema } from '@turni/contracts';
import { AutomationPresetCatalogue } from '../automation-preset-catalogue.js';

describe('AutomationPresetCatalogue', () => {
  it('registers the four Google presets', () => {
    expect(AutomationPresetCatalogue).toEqual([
      'google.calendar.read',
      'google.calendar.write',
      'google.sheets.read',
      'google.sheets.write'
    ]);
  });

  it('every catalogue entry is a valid allowlist preset', () => {
    const parsed = AutomationAllowlistSchema.parse({
      presets: [...AutomationPresetCatalogue]
    });

    expect(parsed.presets).toEqual([...AutomationPresetCatalogue]);
  });
});
