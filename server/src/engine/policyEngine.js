// ═══════════════════════════════════════════════════════════
// Policy Engine — Governs token minting and bias detection
// ═══════════════════════════════════════════════════════════

// ZIP codes flagged for historical lending bias (demo set)
const FLAGGED_ZIP_CODES = ['10001', '30303', '48201', '90210', '60601'];

// Confidence threshold below which a bias flag is raised
const CONFIDENCE_THRESHOLD = getConfidenceThreshold();

// Actions that require step-up authentication
const STEP_UP_ACTIONS = ['SEND_DECISION_EMAIL', 'DELETE_DATA'];

// Valid workflow step ordering
const STEP_ORDER = [
  'READ_APPLICANT_DATA',
  'RUN_CREDIT_SCORE',
  'APPROVE_OR_DENY',
  'SEND_DECISION_EMAIL',
];

class PolicyEngine {
  /**
   * Check if a token can be minted for the given action
   * @returns {{ allowed: boolean, reason?: string, requiresStepUp?: boolean }}
   */
  canMint(actionType, context = {}) {
    // Validate action type
    if (!STEP_ORDER.includes(actionType)) {
      return { allowed: false, reason: `Unknown action type: ${actionType}` };
    }

    // Check step-up requirement
    if (this.requiresStepUp(actionType)) {
      return {
        allowed: true,
        requiresStepUp: true,
        reason: `Action ${actionType} requires step-up authentication`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check credit score result for bias signals
   * @returns {{ flagged: boolean, flagType?: string, details?: object }}
   */
  checkBias(actionType, result = {}) {
    if (actionType !== 'RUN_CREDIT_SCORE') {
      return { flagged: false };
    }

    const flags = [];

    // Check confidence threshold
    if (result.confidence !== undefined && result.confidence < CONFIDENCE_THRESHOLD) {
      flags.push({
        type: 'LOW_CONFIDENCE',
        message: `Score confidence ${(result.confidence * 100).toFixed(1)}% is below threshold ${CONFIDENCE_THRESHOLD * 100}%`,
        confidence: result.confidence,
        threshold: CONFIDENCE_THRESHOLD,
      });
    }

    // Check flagged ZIP codes
    if (result.zip_code && FLAGGED_ZIP_CODES.includes(result.zip_code)) {
      flags.push({
        type: 'FLAGGED_ZIP_CODE',
        message: `ZIP code ${result.zip_code} is in the historical bias watchlist`,
        zip_code: result.zip_code,
      });
    }

    if (flags.length > 0) {
      return {
        flagged: true,
        flagType: 'BIAS_ANOMALY',
        details: {
          flags,
          summary: `Confidence anomaly detected: ${flags.map(f => f.message).join('; ')}`,
          applicant_zip: result.zip_code,
          score: result.score,
          confidence: result.confidence,
        },
      };
    }

    return { flagged: false };
  }

  /**
   * Check if action requires step-up authentication
   */
  requiresStepUp(actionType) {
    return STEP_UP_ACTIONS.includes(actionType);
  }

  /**
   * Get expected next action for a workflow step
   */
  getNextAction(currentStepIndex) {
    if (currentStepIndex + 1 < STEP_ORDER.length) {
      return STEP_ORDER[currentStepIndex + 1];
    }
    return null;
  }

  /**
   * Get all valid action types in order
   */
  getStepOrder() {
    return [...STEP_ORDER];
  }

  /**
   * Get flagged ZIP codes list (for frontend display)
   */
  getFlaggedZipCodes() {
    return [...FLAGGED_ZIP_CODES];
  }
}

export const policyEngine = new PolicyEngine();

function getConfidenceThreshold() {
  const rawThreshold = process.env.FAIRNESS_THRESHOLD;
  const parsedThreshold = Number.parseFloat(rawThreshold ?? '');

  if (Number.isFinite(parsedThreshold) && parsedThreshold >= 0 && parsedThreshold <= 1) {
    return parsedThreshold;
  }

  return 0.75;
}
