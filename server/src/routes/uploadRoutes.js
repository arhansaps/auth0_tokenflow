// ═══════════════════════════════════════════════════════════
// Upload Routes — Workflow upload, templates, and schema
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { validateWorkflow, sanitizeWorkflow, getTemplates, WORKFLOW_SCHEMA } from '../engine/workflowSchema.js';
import { workflowRunner } from '../engine/workflowRunner.js';

const router = Router();

// ─── POST /api/workflows/upload ──────────────────────────
// Validate and store a workflow definition
router.post('/upload', (req, res) => {
  try {
    const { definition } = req.body;
    if (!definition) {
      return res.status(400).json({ error: 'Missing workflow definition in request body' });
    }

    // Validate
    const validation = validateWorkflow(definition);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        message: 'Workflow definition failed validation',
        errors: validation.errors,
      });
    }

    // Sanitize
    const sanitized = sanitizeWorkflow(definition);
    const id = `uwf_${uuidv4().slice(0, 12)}`;

    // Persist
    const db = getDb();
    db.prepare(`
      INSERT INTO uploaded_workflows (id, name, description, definition, status)
      VALUES (?, ?, ?, ?, 'validated')
    `).run(id, sanitized.name, sanitized.description, JSON.stringify(sanitized));

    res.status(201).json({
      success: true,
      id,
      name: sanitized.name,
      description: sanitized.description,
      steps: sanitized.steps,
      message: 'Workflow uploaded and validated successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/workflows/upload/:id/run ──────────────────
// Run an uploaded workflow
router.post('/upload/:id/run', async (req, res) => {
  try {
    const db = getDb();
    const uploaded = db.prepare('SELECT * FROM uploaded_workflows WHERE id = ?').get(req.params.id);
    if (!uploaded) {
      return res.status(404).json({ error: 'Uploaded workflow not found' });
    }

    const definition = JSON.parse(uploaded.definition);
    const taskData = {
      id: uploaded.id,
      name: definition.name,
      description: definition.description,
      agent: definition.agent || 'agent-cloud-worker',
      malicious: false,
      steps: definition.steps,
    };

    const result = await workflowRunner.startWorkflow(taskData);

    // Update last_run_at
    db.prepare('UPDATE uploaded_workflows SET last_run_at = ? WHERE id = ?')
      .run(new Date().toISOString(), uploaded.id);

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/workflows/upload ───────────────────────────
// List all uploaded workflows
router.get('/upload', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM uploaded_workflows ORDER BY uploaded_at DESC').all();
  const workflows = rows.map(r => {
    try { r.definition = JSON.parse(r.definition); } catch { r.definition = null; }
    return r;
  });
  res.json({ success: true, workflows, count: workflows.length });
});

// ─── GET /api/workflows/templates ────────────────────────
// Return starter templates
router.get('/templates', (req, res) => {
  res.json({ success: true, templates: getTemplates() });
});

// ─── GET /api/workflows/schema ───────────────────────────
// Return the JSON schema for client-side validation
router.get('/schema', (req, res) => {
  res.json({ success: true, schema: WORKFLOW_SCHEMA });
});

export default router;
