import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function buildGithubAdminPlan({ owner, repo, productionReviewerId }) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('Invalid GitHub owner');
  }
  if (!Number.isSafeInteger(productionReviewerId) || productionReviewerId <= 0) {
    throw new Error('Invalid production reviewer id');
  }
  const repository = `repos/${owner}/${repo}`;
  const protectedBranchesOnly = {
    protected_branches: true,
    custom_branch_policies: false
  };

  return [
    {
      method: 'PUT',
      endpoint: `${repository}/actions/permissions`,
      body: {
        enabled: true,
        allowed_actions: 'selected',
        sha_pinning_required: false
      }
    },
    {
      method: 'PUT',
      endpoint: `${repository}/actions/permissions/selected-actions`,
      body: {
        github_owned_allowed: true,
        verified_allowed: true,
        patterns_allowed: []
      }
    },
    {
      method: 'PUT',
      endpoint: `${repository}/actions/permissions/workflow`,
      body: {
        default_workflow_permissions: 'read',
        can_approve_pull_request_reviews: false
      }
    },
    {
      method: 'PUT',
      endpoint: `${repository}/environments/staging`,
      body: { deployment_branch_policy: protectedBranchesOnly }
    },
    {
      method: 'PUT',
      endpoint: `${repository}/environments/production`,
      body: {
        reviewers: [{ type: 'User', id: productionReviewerId }],
        prevent_self_review: false,
        deployment_branch_policy: protectedBranchesOnly
      }
    },
    {
      method: 'PUT',
      endpoint: `${repository}/branches/main/protection`,
      body: {
        required_status_checks: { strict: true, contexts: ['verify'] },
        enforce_admins: true,
        required_pull_request_reviews: {
          dismiss_stale_reviews: true,
          require_code_owner_reviews: false,
          required_approving_review_count: 0,
          require_last_push_approval: false
        },
        restrictions: null,
        required_linear_history: true,
        allow_force_pushes: false,
        allow_deletions: false,
        block_creations: false,
        required_conversation_resolution: true,
        lock_branch: false,
        allow_fork_syncing: false
      }
    }
  ];
}

export async function executeGithubAdminPlan(plan, { apply, request }) {
  if (!apply) {
    return plan;
  }
  for (const operation of plan) {
    await request(operation);
  }
  return plan;
}

export function parseGithubAdminMode(args) {
  for (const argument of args) {
    if (argument !== '--apply') {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return args.includes('--apply');
}

function runGh(args, input) {
  const executable = process.env.GH_CLI_PATH ?? 'gh';
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `gh exited with code ${code}`));
    });
    child.stdin.end(input);
  });
}

async function requestGithub(operation) {
  await runGh(
    [
      'api',
      operation.endpoint,
      '--method',
      operation.method,
      '--input',
      '-',
      '--silent',
      '--header',
      'Accept: application/vnd.github+json',
      '--header',
      'X-GitHub-Api-Version: 2026-03-10'
    ],
    JSON.stringify(operation.body)
  );
}

async function main() {
  const apply = parseGithubAdminMode(process.argv.slice(2));
  const reviewerId = Number(await runGh(['api', 'user', '--jq', '.id']));
  const plan = buildGithubAdminPlan({
    owner: 'turni-dev',
    repo: 'platform',
    productionReviewerId: reviewerId
  });

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  await executeGithubAdminPlan(plan, { apply, request: requestGithub });
  console.log(`Applied ${plan.length} GitHub administration controls`);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entrypoint === import.meta.url) {
  await main();
}
