import {
  formatPolicyEvaluationReport,
  runPolicyEvaluation
} from '../../apps/backend/src/platform/evaluation/policy-eval-runner.js';

console.log(formatPolicyEvaluationReport(runPolicyEvaluation()));
