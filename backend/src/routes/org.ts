import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getOrgStructure,
  createUnit,
  createDepartment,
  createPosition,
  getPositionPeople,
} from '../controllers/orgController';

const router = express.Router();

router.get('/structure', authenticateToken, getOrgStructure);
router.post('/units', authenticateToken, createUnit);
router.post('/departments', authenticateToken, createDepartment);
router.post('/positions', authenticateToken, createPosition);
router.get('/positions/:positionId/people', authenticateToken, getPositionPeople);

export default router;

