/**
 * The presets an owner may add to their agent's automation allowlist.
 * `AutomationAllowlistSchema` in `@turni/contracts` accepts any string — it is
 * a default-deny list, not a catalogue-enforced one — so nothing at the
 * schema level stops a stale or misspelled preset from being saved. This
 * catalogue is where a card registers the presets it actually understands,
 * so the cabinet's automations screen has something real to offer instead of
 * the empty list it showed before any integration had one. Google is the
 * first entrant; Telegram registers its own presets here when that card
 * lands.
 */
export const AutomationPresetCatalogue = [
  'google.calendar.read',
  'google.calendar.write',
  'google.sheets.read',
  'google.sheets.write'
] as const;

export type AutomationPreset = (typeof AutomationPresetCatalogue)[number];
