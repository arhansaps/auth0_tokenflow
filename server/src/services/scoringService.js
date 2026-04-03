// ═══════════════════════════════════════════════════════════
// Mock Credit Scoring Service
// ═══════════════════════════════════════════════════════════

const FLAGGED_ZIP_CODES = ['10001', '30303', '48201', '90210', '60601'];
const FAIRNESS_THRESHOLD = getFairnessThreshold();

/**
 * Calculate a credit score for an applicant
 * Deterministic: uses applicant data to derive reproducible results
 * 
 * @param {object} applicantData
 * @returns {{ score: number, confidence: number, factors: object[], flagged: boolean, zip_code: string }}
 */
export function calculateScore(applicantData) {
  const { income = 0, requested_amount = 0, employment_years = 0, zip_code = '', employment_status = '' } = applicantData;

  // ─── Base score calculation ───────────────────────────────
  let score = 500; // Start at midpoint

  // Income-to-loan ratio (higher = better)
  const ratio = income / Math.max(requested_amount, 1);
  if (ratio > 4) score += 120;
  else if (ratio > 3) score += 90;
  else if (ratio > 2) score += 60;
  else if (ratio > 1.5) score += 30;
  else score -= 40;

  // Employment tenure
  if (employment_years >= 5) score += 80;
  else if (employment_years >= 3) score += 50;
  else if (employment_years >= 1) score += 20;
  else score -= 30;

  // Employment status
  if (employment_status === 'employed') score += 40;
  else if (employment_status === 'self-employed') score += 10;
  else score -= 50;

  // Clamp score
  score = Math.max(300, Math.min(850, score));

  // ─── Confidence calculation ───────────────────────────────
  // Confidence is lower for flagged ZIP codes (simulating historical data gaps)
  let confidence = 0.88;
  if (FLAGGED_ZIP_CODES.includes(zip_code)) {
    confidence = 0.62 + (Math.abs(hashCode(zip_code)) % 10) / 100;
  }
  if (employment_status === 'self-employed') {
    confidence -= 0.08;
  }
  if (employment_years < 2) {
    confidence -= 0.05;
  }
  confidence = Math.max(0.3, Math.min(0.99, confidence));

  // ─── Contributing factors ────────────────────────────────
  const factors = [
    {
      name: 'Income-to-Loan Ratio',
      value: ratio.toFixed(2),
      impact: ratio > 2 ? 'positive' : 'negative',
    },
    {
      name: 'Employment Tenure',
      value: `${employment_years} years`,
      impact: employment_years >= 3 ? 'positive' : 'neutral',
    },
    {
      name: 'Employment Status',
      value: employment_status,
      impact: employment_status === 'employed' ? 'positive' : 'neutral',
    },
    {
      name: 'Geographic Data Coverage',
      value: FLAGGED_ZIP_CODES.includes(zip_code) ? 'Limited historical data' : 'Sufficient data',
      impact: FLAGGED_ZIP_CODES.includes(zip_code) ? 'negative' : 'positive',
    },
  ];

  return {
    score,
    confidence: Math.round(confidence * 1000) / 1000,
    factors,
    flagged: FLAGGED_ZIP_CODES.includes(zip_code) || confidence < FAIRNESS_THRESHOLD,
    zip_code,
    requested_amount,
    income,
  };
}

// Simple deterministic hash for reproducible results
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

function getFairnessThreshold() {
  const rawThreshold = process.env.FAIRNESS_THRESHOLD;
  const parsedThreshold = Number.parseFloat(rawThreshold ?? '');

  if (Number.isFinite(parsedThreshold) && parsedThreshold >= 0 && parsedThreshold <= 1) {
    return parsedThreshold;
  }

  return 0.75;
}
