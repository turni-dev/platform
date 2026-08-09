export type LockedPolicySeed = Readonly<{
  id: 'injection' | 'allergy-health' | 'money' | 'complaint-refund';
  verdict: 'approval';
  riskScore: 8 | 9 | 10;
  locked: true;
  pattern: Readonly<{
    source: string;
    flags: 'iu';
  }>;
}>;

function lockedSeed(
  id: LockedPolicySeed['id'],
  riskScore: LockedPolicySeed['riskScore'],
  source: string
): LockedPolicySeed {
  return Object.freeze({
    id,
    verdict: 'approval',
    riskScore,
    locked: true,
    pattern: Object.freeze({ source, flags: 'iu' })
  });
}

export const LOCKED_POLICY_SEEDS: readonly LockedPolicySeed[] = Object.freeze([
  lockedSeed(
    'injection',
    8,
    'игнорир\\S*(?: (?:все )?предыдущ\\S*)? инструкц|системн\\S* промпт'
  ),
  lockedSeed(
    'allergy-health',
    10,
    'аллерги\\S*|аллерген\\S*|анафилакс|диабет\\S*|беременност\\S*|медицин\\S*|здоровь\\S*'
  ),
  lockedSeed('money', 9, 'предоплат\\S*|оплат\\S*|сч[её]т\\S*|ден[еь]г\\S*|стоимост\\S*|цен[ауые]\\S*|чаев\\S*'),
  lockedSeed('complaint-refund', 8, 'жалоб\\S*|жалова\\S*|претензи\\S*|возврат\\S*|верните ден')
]);
