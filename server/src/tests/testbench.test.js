// ═══════════════════════════════════════════════════════════
// Testbench Integration Tests
// Run with: node --test server/src/tests/testbench.test.js
// ═══════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Setup: import the engine modules directly
// We must boot the DB first
import '../loadEnv.js';
import { getDb, closeDb } from '../db/database.js';
import { testbenchEngine } from '../engine/testbenchEngine.js';
import { validateWorkflow, sanitizeWorkflow } from '../engine/workflowSchema.js';

before(() => {
  // Use in-memory DB for tests by setting env
  process.env.DATABASE_URL = ':memory:';
  getDb();
});

after(() => {
  closeDb();
});

describe('Testbench Engine', () => {
  it('should list all 7 scenarios', () => {
    const scenarios = testbenchEngine.getScenarios();
    assert.equal(scenarios.length, 7, 'Expected 7 scenarios');
    assert.ok(scenarios.some(s => s.id === 'SCENARIO-001'), 'Missing SCENARIO-001');
    assert.ok(scenarios.some(s => s.id === 'SCENARIO-002'), 'Missing SCENARIO-002');
  });

  it('should run SCENARIO-001 (Normal) and pass', async () => {
    const result = await testbenchEngine.runScenario('SCENARIO-001');
    assert.equal(result.status, 'passed', `Normal scenario should pass but got: ${result.status}`);
    assert.ok(result.passed > 0, 'Should have passing assertions');
    assert.equal(result.failed, 0, 'Should have zero failures');
  });

  it('should run SCENARIO-002 (Double Agent) and pass', async () => {
    const result = await testbenchEngine.runScenario('SCENARIO-002');
    assert.equal(result.status, 'passed', `Double Agent scenario should pass: ${JSON.stringify(result.assertions?.filter(a => !a.passed))}`);
  });

  it('should run SCENARIO-004 (Replay) and pass', async () => {
    const result = await testbenchEngine.runScenario('SCENARIO-004');
    assert.equal(result.status, 'passed', `Replay scenario should pass: ${JSON.stringify(result.assertions?.filter(a => !a.passed))}`);
  });

  it('should run SCENARIO-006 (Kill Switch) and pass', async () => {
    const result = await testbenchEngine.runScenario('SCENARIO-006');
    assert.equal(result.status, 'passed', `Kill Switch scenario should pass: ${JSON.stringify(result.assertions?.filter(a => !a.passed))}`);
  });

  it('should persist test results', () => {
    const results = testbenchEngine.getResults(10);
    assert.ok(results.length > 0, 'Should have persisted results');
  });
});

describe('Workflow Schema Validation', () => {
  it('should validate a correct workflow', () => {
    const result = validateWorkflow({
      name: 'Test Workflow',
      steps: [
        { action: 'READ_OBJECT', service: 'gcs', resource: 'data/input.json', actionVerb: 'read' },
      ],
    });
    assert.ok(result.valid, `Should be valid: ${result.errors.join(', ')}`);
  });

  it('should reject a workflow with no steps', () => {
    const result = validateWorkflow({ name: 'Bad', steps: [] });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('non-empty')));
  });

  it('should reject unauthorized services', () => {
    const result = validateWorkflow({
      name: 'Bad',
      steps: [{ action: 'READ_OBJECT', service: 'source-control', resource: 'x', actionVerb: 'read' }],
    });
    assert.ok(!result.valid);
  });

  it('should reject action/verb mismatches', () => {
    const result = validateWorkflow({
      name: 'Bad',
      steps: [{ action: 'READ_OBJECT', service: 'gcs', resource: 'x', actionVerb: 'write' }],
    });
    assert.ok(!result.valid);
    assert.ok(result.errors.some(e => e.includes('does not match')));
  });

  it('should reject path traversal', () => {
    const result = validateWorkflow({
      name: 'Bad',
      steps: [{ action: 'READ_OBJECT', service: 'gcs', resource: '../../etc/passwd', actionVerb: 'read' }],
    });
    assert.ok(!result.valid);
  });

  it('should sanitize a workflow', () => {
    const sanitized = sanitizeWorkflow({
      name: 'Test',
      agent: 'evil-agent',
      malicious: true,
      steps: [{ action: 'READ_OBJECT', service: 'gcs', resource: 'data.json', actionVerb: 'read' }],
    });
    assert.equal(sanitized.agent, 'agent-cloud-worker', 'Agent should be overridden');
    assert.equal(sanitized.malicious, false, 'Malicious flag should be removed');
  });
});
