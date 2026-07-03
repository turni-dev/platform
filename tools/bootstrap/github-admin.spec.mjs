import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGithubAdminPlan,
  executeGithubAdminPlan,
  parseGithubAdminMode
} from './github-admin.mjs';

describe('GitHub admin plan', () => {
  it('builds fail-closed repository controls', () => {
    const plan = buildGithubAdminPlan({
      owner: 'turni-dev',
      repo: 'platform',
      productionReviewerId: 42
    });

    const workflowPermissions = plan.find(
      ({ endpoint }) => endpoint === 'repos/turni-dev/platform/actions/permissions/workflow'
    );
    assert.deepEqual(workflowPermissions?.body, {
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: false
    });

    const branchProtection = plan.find(
      ({ endpoint }) => endpoint === 'repos/turni-dev/platform/branches/main/protection'
    );
    assert.deepEqual(branchProtection?.body.required_status_checks, {
      strict: true,
      contexts: ['verify']
    });
    assert.equal(branchProtection?.body.enforce_admins, true);
    assert.equal(
      branchProtection?.body.required_pull_request_reviews.require_code_owner_reviews,
      false
    );
    assert.equal(
      branchProtection?.body.required_pull_request_reviews.required_approving_review_count,
      0
    );
    assert.equal(
      branchProtection?.body.required_pull_request_reviews.require_last_push_approval,
      false
    );
    assert.equal(branchProtection?.body.allow_force_pushes, false);
    assert.equal(branchProtection?.body.allow_deletions, false);
  });

  it('scopes actions and deployment environments', () => {
    const plan = buildGithubAdminPlan({
      owner: 'turni-dev',
      repo: 'platform',
      productionReviewerId: 42
    });

    const actions = plan.find(
      ({ endpoint }) => endpoint === 'repos/turni-dev/platform/actions/permissions'
    );
    assert.deepEqual(actions?.body, {
      enabled: true,
      allowed_actions: 'selected',
      sha_pinning_required: false
    });

    const staging = plan.find(
      ({ endpoint }) => endpoint === 'repos/turni-dev/platform/environments/staging'
    );
    assert.deepEqual(staging?.body.deployment_branch_policy, {
      protected_branches: true,
      custom_branch_policies: false
    });

    const production = plan.find(
      ({ endpoint }) => endpoint === 'repos/turni-dev/platform/environments/production'
    );
    assert.deepEqual(production?.body.reviewers, [{ type: 'User', id: 42 }]);
    assert.equal(production?.body.prevent_self_review, false);
  });

  it('allows only GitHub-owned and verified actions', () => {
    const plan = buildGithubAdminPlan({
      owner: 'turni-dev',
      repo: 'platform',
      productionReviewerId: 42
    });

    const selectedActions = plan.find(
      ({ endpoint }) =>
        endpoint === 'repos/turni-dev/platform/actions/permissions/selected-actions'
    );
    assert.deepEqual(selectedActions?.body, {
      github_owned_allowed: true,
      verified_allowed: true,
      patterns_allowed: []
    });
  });

  it('rejects unsafe repository coordinates and reviewer ids', () => {
    assert.throws(
      () =>
        buildGithubAdminPlan({
          owner: '../other',
          repo: 'platform',
          productionReviewerId: 42
        }),
      /Invalid GitHub owner/
    );
    assert.throws(
      () =>
        buildGithubAdminPlan({
          owner: 'turni-dev',
          repo: 'platform',
          productionReviewerId: 0
        }),
      /Invalid production reviewer id/
    );
  });

  it('does not call GitHub unless apply is explicit', async () => {
    const plan = buildGithubAdminPlan({
      owner: 'turni-dev',
      repo: 'platform',
      productionReviewerId: 42
    });
    const calls = [];
    const request = async (operation) => calls.push(operation.endpoint);

    const preview = await executeGithubAdminPlan(plan, { apply: false, request });
    assert.deepEqual(calls, []);
    assert.deepEqual(preview, plan);

    await executeGithubAdminPlan(plan, { apply: true, request });
    assert.deepEqual(calls, plan.map(({ endpoint }) => endpoint));
  });

  it('requires an explicit apply CLI flag', () => {
    assert.equal(parseGithubAdminMode([]), false);
    assert.equal(parseGithubAdminMode(['--apply']), true);
    assert.throws(() => parseGithubAdminMode(['--force']), /Unknown argument/);
  });
});
