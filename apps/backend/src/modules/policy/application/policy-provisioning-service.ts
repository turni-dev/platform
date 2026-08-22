import type { DefaultPolicySet } from '../domain/default-policy-set.js';
import type {
  PolicyProvisioningTrackerPort,
  PolicyRowIdentity,
  PolicyWriterPort
} from './policy-provisioning.port.js';

export interface DefaultPolicyProvisioningResult {
  readonly applied: boolean;
  readonly version: string;
  readonly fingerprint: string;
  readonly insertedRuleIds: readonly string[];
  readonly skippedRuleIds: readonly string[];
}

/**
 * Idempotently applies the shipped default policy set
 * (`domain/default-policy-set.ts`) to one tenant/agent -- "без них policy
 * пустой" from the task-board card.
 *
 * Idempotency is keyed on the default set's *dimension* (version +
 * content fingerprint, not mere row existence): if the tracker already
 * recorded this exact dimension for the identity, `provision` is a pure
 * no-op read -- re-running it for an already-provisioned tenant/agent never
 * duplicates rows, never errors, and never touches the database.
 *
 * When the shipped defaults change (a new fingerprint), provisioning runs
 * again but only ever *inserts* a rule whose path does not already exist for
 * that agent -- it never updates or deletes an existing row. That is
 * deliberate:
 *   - a `locked` row is immutable once written (the `policies` table's RLS
 *     forbids UPDATE/DELETE for `layer = 'locked'`, independent of this
 *     service);
 *   - a `workspace`-tier starter template the owner has since edited or
 *     removed through the normal policy-authoring path (which validates a
 *     narrowing write via `domain/policy-rule-write.ts`) is left exactly as
 *     the owner left it.
 * A defaults update therefore gets "detected and re-applied deliberately" --
 * any *new* rule id it introduces is inserted -- "not silently skipped
 * forever" -- the fingerprint change is what makes this pass run at all --
 * "nor blindly overwritten" -- an existing row for a path the new defaults
 * also touch is left alone.
 */
export class PolicyProvisioningService {
  public constructor(
    private readonly writer: PolicyWriterPort,
    private readonly tracker: PolicyProvisioningTrackerPort,
    private readonly defaults: DefaultPolicySet
  ) {}

  public async provision(identity: PolicyRowIdentity): Promise<DefaultPolicyProvisioningResult> {
    const status = await this.tracker.getStatus(identity);
    if (status !== undefined && status.fingerprint === this.defaults.fingerprint) {
      return Object.freeze({
        applied: false,
        version: this.defaults.version,
        fingerprint: this.defaults.fingerprint,
        insertedRuleIds: Object.freeze([]),
        skippedRuleIds: Object.freeze(this.defaults.rows.map((row) => row.path))
      });
    }

    const insertedRuleIds: string[] = [];
    const skippedRuleIds: string[] = [];

    for (const row of this.defaults.rows) {
      const existing = await this.writer.findByPath(identity, row.path);
      if (existing !== undefined) {
        skippedRuleIds.push(row.path);
        continue;
      }

      const inserted = await this.writer.insertIfAbsent(identity, {
        path: row.path,
        layer: row.layer,
        compiled: row.compiled
      });
      (inserted ? insertedRuleIds : skippedRuleIds).push(row.path);
    }

    await this.tracker.recordStatus(identity, {
      version: this.defaults.version,
      fingerprint: this.defaults.fingerprint
    });

    return Object.freeze({
      applied: true,
      version: this.defaults.version,
      fingerprint: this.defaults.fingerprint,
      insertedRuleIds: Object.freeze(insertedRuleIds),
      skippedRuleIds: Object.freeze(skippedRuleIds)
    });
  }
}
