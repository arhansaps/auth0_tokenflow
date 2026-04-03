// ═══════════════════════════════════════════════════════════
// Workflow Runner — Orchestrates the loan application demo
// ═══════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { tokenEngine } from './tokenEngine.js';
import { policyEngine } from './policyEngine.js';
import { calculateScore } from '../services/scoringService.js';
import { sendDecisionEmail } from '../services/emailService.js';
import { vaultService } from '../services/vaultService.js';
import { broadcast } from '../websocket/wsServer.js';

const AGENT_ID = 'agent-loan-processor';

// Step execution delay (ms) — slowed for visual demo
const STEP_DELAY = 1500;

class WorkflowRunner {
  /**
   * Start a new loan application workflow
   */
  async startWorkflow(applicantData) {
    const db = getDb();
    const workflowId = `wf_${uuidv4().slice(0, 12)}`;

    db.prepare(`
      INSERT INTO workflows (id, name, status, applicant_data, current_step)
      VALUES (?, ?, 'running', ?, 0)
    `).run(workflowId, `Loan Application — ${applicantData.name}`, JSON.stringify(applicantData));

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'STARTED',
        workflowId,
        applicantData,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Started ${workflowId} for ${applicantData.name}`);

    // Begin step 1 after a short delay for visual effect
    setTimeout(() => this.executeStep(workflowId, 0), STEP_DELAY);

    return { workflowId, status: 'running', applicantData };
  }

  /**
   * Execute a specific workflow step
   */
  async executeStep(workflowId, stepIndex) {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status === 'aborted' || workflow.status === 'completed') return;

    const applicantData = JSON.parse(workflow.applicant_data);
    const steps = policyEngine.getStepOrder();
    const actionType = steps[stepIndex];

    if (!actionType) {
      this._updateWorkflow(workflowId, 'completed', stepIndex);
      broadcast({ type: 'WORKFLOW_EVENT', payload: { event: 'COMPLETED', workflowId, timestamp: new Date().toISOString() } });
      console.log(`[WORKFLOW] Completed ${workflowId}`);
      return;
    }

    // Get previous token ID for chain linking
    const chain = tokenEngine.getTokenChain(workflowId);
    const parentTokenId = chain.length > 0 ? chain[chain.length - 1].id : null;

    // Mint token for this step
    const policy = policyEngine.canMint(actionType, { applicantData });
    if (!policy.allowed) {
      console.error(`[WORKFLOW] Policy denied minting for ${actionType}: ${policy.reason}`);
      return;
    }

    const token = tokenEngine.mintToken(
      workflowId,
      actionType,
      applicantData.id,
      AGENT_ID,
      { applicantData, stepIndex },
      parentTokenId,
      stepIndex
    );

    // Short delay, then activate and execute
    await this._delay(STEP_DELAY);

    // Check workflow is still alive
    const currentWorkflow = this.getWorkflow(workflowId);
    if (currentWorkflow.status === 'aborted') return;

    tokenEngine.activateToken(token.id);
    this._updateWorkflow(workflowId, 'running', stepIndex);

    await this._delay(STEP_DELAY);

    // Execute the step action
    try {
      const result = await this._executeAction(actionType, applicantData, workflowId, token.id, stepIndex);

      // Check if bias was flagged — pause workflow
      if (result._paused) {
        this._updateWorkflow(workflowId, 'paused', stepIndex);
        return; // Wait for human review
      }

      // Consume (burn) the token
      tokenEngine.consumeToken(token.id, result);

      // Auto-advance to next step after delay
      await this._delay(STEP_DELAY);
      this.executeStep(workflowId, stepIndex + 1);
    } catch (error) {
      console.error(`[WORKFLOW] Step ${stepIndex} failed:`, error.message);
      tokenEngine.revokeToken(token.id, `Execution failed: ${error.message}`, 'system');
      this._updateWorkflow(workflowId, 'aborted', stepIndex);
    }
  }

  /**
   * Resume a paused workflow after human review approval
   */
  async resumeWorkflow(workflowId) {
    const db = getDb();
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status !== 'paused') throw new Error(`Workflow ${workflowId} is ${workflow.status}, not paused`);

    const applicantData = JSON.parse(workflow.applicant_data);

    // Find the flagged token and burn it with review result
    const chain = tokenEngine.getTokenChain(workflowId);
    const flaggedToken = chain.find(t => t.status === 'flagged');

    if (flaggedToken) {
      // Reactivate and consume the flagged token
      const tDb = getDb();
      tDb.prepare(`UPDATE tokens SET status = 'active' WHERE id = ?`).run(flaggedToken.id);
      tokenEngine.consumeToken(flaggedToken.id, { review: 'approved', reviewer: 'human' });
    }

    this._updateWorkflow(workflowId, 'running', workflow.current_step);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'RESUMED',
        workflowId,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Resumed ${workflowId}`);

    // Continue to next step
    await this._delay(STEP_DELAY);
    this.executeStep(workflowId, workflow.current_step + 1);

    return { workflowId, status: 'running' };
  }

  /**
   * Abort a workflow after human review rejection
   */
  async abortWorkflow(workflowId) {
    const workflow = this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    // Revoke all active tokens
    tokenEngine.revokeAllActive(workflowId);
    this._updateWorkflow(workflowId, 'aborted', workflow.current_step);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'ABORTED',
        workflowId,
        reason: 'Human reviewer rejected',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Aborted ${workflowId}`);
    return { workflowId, status: 'aborted' };
  }

  /**
   * Kill switch — immediately revoke everything
   */
  async killWorkflow(workflowId) {
    const revokedCount = tokenEngine.revokeAllActive(workflowId);
    this._updateWorkflow(workflowId, 'aborted', null);

    broadcast({
      type: 'WORKFLOW_EVENT',
      payload: {
        event: 'KILLED',
        workflowId,
        revokedCount,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[WORKFLOW] Killed ${workflowId} — revoked ${revokedCount} tokens`);
    return { workflowId, status: 'aborted', revokedCount };
  }

  // ─── Internal action execution ────────────────────────────

  async _executeAction(actionType, applicantData, workflowId, tokenId, stepIndex) {
    switch (actionType) {
      case 'READ_APPLICANT_DATA':
        return this._readApplicantData(applicantData);

      case 'RUN_CREDIT_SCORE':
        return this._runCreditScore(applicantData, workflowId, tokenId);

      case 'APPROVE_OR_DENY':
        return this._approveOrDeny(applicantData, workflowId);

      case 'SEND_DECISION_EMAIL':
        return this._sendDecisionEmail(applicantData, workflowId);

      default:
        throw new Error(`Unknown action: ${actionType}`);
    }
  }

  async _readApplicantData(applicantData) {
    console.log(`[ACTION] Reading applicant data for ${applicantData.name}`);
    // Simulate reading from a database/API
    await vaultService.getCredential('identity_verify');

    return {
      action: 'READ_APPLICANT_DATA',
      data: {
        name: applicantData.name,
        zip_code: applicantData.zip_code,
        income: applicantData.income,
        requested_amount: applicantData.requested_amount,
        employment_status: applicantData.employment_status,
        employment_years: applicantData.employment_years,
      },
      message: `Applicant data read successfully for ${applicantData.name}`,
    };
  }

  async _runCreditScore(applicantData, workflowId, tokenId) {
    console.log(`[ACTION] Running credit score for ${applicantData.name}`);

    // Retrieve credit bureau credential from vault
    await vaultService.getCredential('credit_bureau');

    // Calculate score
    const scoreResult = calculateScore(applicantData);

    // Check for bias
    const biasCheck = policyEngine.checkBias('RUN_CREDIT_SCORE', {
      ...scoreResult,
      zip_code: applicantData.zip_code,
    });

    if (biasCheck.flagged) {
      console.log(`[ACTION] Bias detected — pausing workflow`);
      tokenEngine.flagToken(tokenId, biasCheck.flagType, {
        ...biasCheck.details,
        applicantData: {
          name: applicantData.name,
          zip_code: applicantData.zip_code,
          income: applicantData.income,
          requested_amount: applicantData.requested_amount,
        },
        scoreResult,
      });

      return { _paused: true, scoreResult, biasCheck };
    }

    return {
      action: 'RUN_CREDIT_SCORE',
      scoreResult,
      message: `Credit score: ${scoreResult.score}, Confidence: ${(scoreResult.confidence * 100).toFixed(1)}%`,
    };
  }

  async _approveOrDeny(applicantData, workflowId) {
    console.log(`[ACTION] Making approval decision for ${applicantData.name}`);

    // Get the score from previous step
    const chain = tokenEngine.getTokenChain(workflowId);
    const scoreToken = chain.find(t => t.action_type === 'RUN_CREDIT_SCORE');
    const scoreResult = scoreToken?.context?.result?.scoreResult || calculateScore(applicantData);

    const decision = scoreResult.score >= 600 ? 'approved' : 'denied';

    // Store decision in workflow
    const db = getDb();
    const workflow = this.getWorkflow(workflowId);
    const workflowData = JSON.parse(workflow.applicant_data);
    workflowData._decision = decision;
    workflowData._scoreResult = scoreResult;
    db.prepare('UPDATE workflows SET applicant_data = ? WHERE id = ?').run(JSON.stringify(workflowData), workflowId);

    return {
      action: 'APPROVE_OR_DENY',
      decision,
      score: scoreResult.score,
      message: `Loan ${decision} for ${applicantData.name} (score: ${scoreResult.score})`,
    };
  }

  async _sendDecisionEmail(applicantData, workflowId) {
    console.log(`[ACTION] Sending decision email to ${applicantData.email}`);

    const workflow = this.getWorkflow(workflowId);
    const workflowData = JSON.parse(workflow.applicant_data);
    const decision = workflowData._decision || 'denied';
    const scoreResult = workflowData._scoreResult || {};

    const emailResult = await sendDecisionEmail(applicantData, decision, scoreResult);

    return {
      action: 'SEND_DECISION_EMAIL',
      emailResult,
      message: `Decision email sent to ${applicantData.email} — ${decision}`,
    };
  }

  // ─── Query helpers ────────────────────────────────────────

  getWorkflow(workflowId) {
    const db = getDb();
    return db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId);
  }

  listWorkflows() {
    const db = getDb();
    return db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
  }

  _updateWorkflow(workflowId, status, currentStep) {
    const db = getDb();
    const updates = { status, updated_at: new Date().toISOString() };
    if (currentStep !== null && currentStep !== undefined) {
      db.prepare('UPDATE workflows SET status = ?, current_step = ?, updated_at = ? WHERE id = ?')
        .run(status, currentStep, updates.updated_at, workflowId);
    } else {
      db.prepare('UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, updates.updated_at, workflowId);
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const workflowRunner = new WorkflowRunner();
