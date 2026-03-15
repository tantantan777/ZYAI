import express from 'express';
import {
  authenticateToken,
  requireProjectCreateAccess,
  requireProjectDeleteAccess,
  requireProjectEditAccess,
  requireProjectsAccess,
} from '../middleware/auth';
import {
  createProject,
  deleteProject,
  getProjectDashboardSummary,
  listProjects,
  updateProject,
} from '../controllers/projectController';

const router = express.Router();

router.get('/dashboard-summary', authenticateToken, getProjectDashboardSummary);
router.get('/', authenticateToken, requireProjectsAccess, listProjects);
router.post('/', authenticateToken, requireProjectCreateAccess, createProject);
router.put('/:projectId', authenticateToken, requireProjectEditAccess, updateProject);
router.delete('/:projectId', authenticateToken, requireProjectDeleteAccess, deleteProject);

export default router;
