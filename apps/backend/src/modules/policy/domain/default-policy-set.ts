import { createHash } from 'node:crypto';

import { compileSelectorRuleList } from './policy-rule-yaml-parser.js';
import type { CompiledSelectorPolicyRow, SelectorPolicyRule } from './policy-rule-selector.js';

/**
 * A tenant/agent is "provisioned at dimension X" when its recorded
 * fingerprint matches the currently-shipped default set's fingerprint --
 * "провижининг тенанта идемпотентен по «измерению» политики" from the
 * task-board card. `version` is the human label carried by the YAML file
 * (`infrastructure/database/default-policies.yaml`); `fingerprint` is a
 * content hash over the compiled rule set, so an edit to that file that
 * forgets to bump `version` is still detected -- the fingerprint changes
 * regardless -- while an unedited file always reproduces the same
 * fingerprint across process restarts.
 */
export interface DefaultPolicySet {
  readonly version: string;
  readonly fingerprint: string;
  readonly rows: readonly CompiledSelectorPolicyRow[];
}

/** Recursively sorts object keys so the hash does not depend on JS object
 * insertion order -- only on the actual rule content. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalize(entryValue)]));
  }
  return value;
}

function fingerprintOf(rows: readonly CompiledSelectorPolicyRow[]): string {
  const canonicalRows = [...rows]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((row) => canonicalize(row));
  return createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex');
}

/**
 * Compiles a labelled list of selector rules (as parsed from the
 * `default_policies` YAML document) into a fingerprinted `DefaultPolicySet`.
 * Pure/deterministic -- no I/O -- so infrastructure only has to read the
 * file and hand the parsed `{version, rules}` pair here.
 */
export function computeDefaultPolicySet(
  version: string,
  rules: readonly SelectorPolicyRule[]
): DefaultPolicySet {
  const rows = compileSelectorRuleList(rules);
  return Object.freeze({ version, fingerprint: fingerprintOf(rows), rows });
}
