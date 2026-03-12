import express from 'express';
import { authenticateToken, requireSystemSettingsAccess } from '../middleware/auth';
import {
  getOrgStructure,
  createUnit,
  createDepartment,
  createPosition,
  getPositionPeople,
  getUnassignedPeople,
  renameUnit,
  deleteUnit,
  renameDepartment,
  deleteDepartment,
  renamePosition,
  deletePosition,
  updateSystemSettingsVisibility,
  renamePerson,
  removePersonFromPosition,
} from '../controllers/orgController';

const router = express.Router();

router.get('/structure', authenticateToken, getOrgStructure);
router.post('/units', authenticateToken, requireSystemSettingsAccess, createUnit);
router.put('/units/:unitId', authenticateToken, requireSystemSettingsAccess, renameUnit);
router.delete('/units/:unitId', authenticateToken, requireSystemSettingsAccess, deleteUnit);
router.post('/departments', authenticateToken, requireSystemSettingsAccess, createDepartment);
router.put('/departments/:departmentId', authenticateToken, requireSystemSettingsAccess, renameDepartment);
router.delete('/departments/:departmentId', authenticateToken, requireSystemSettingsAccess, deleteDepartment);
router.post('/positions', authenticateToken, requireSystemSettingsAccess, createPosition);
router.put('/positions/:positionId', authenticateToken, requireSystemSettingsAccess, renamePosition);
router.delete('/positions/:positionId', authenticateToken, requireSystemSettingsAccess, deletePosition);
router.put('/permissions/:targetType/:targetId', authenticateToken, requireSystemSettingsAccess, updateSystemSettingsVisibility);
router.get('/unassigned-people', authenticateToken, requireSystemSettingsAccess, getUnassignedPeople);
router.get('/positions/:positionId/people', authenticateToken, requireSystemSettingsAccess, getPositionPeople);
router.put('/people/:userId', authenticateToken, requireSystemSettingsAccess, renamePerson);
router.delete('/positions/:positionId/people/:userId', authenticateToken, requireSystemSettingsAccess, removePersonFromPosition);

export default router;
