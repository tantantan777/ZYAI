import express from 'express';
import { authenticateToken, requireSystemSettingsAccess } from '../middleware/auth';
import {
  getOrgStructure,
  createUnitNature,
  renameUnitNature,
  deleteUnitNature,
  activateUnitNaturesForOrg,
  deactivateUnitNatureForOrg,
  createProjectType,
  renameProjectType,
  deleteProjectType,
  createConstructionNature,
  renameConstructionNature,
  deleteConstructionNature,
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
  renamePerson,
  removePersonFromPosition,
  movePersonToPosition,
} from '../controllers/orgController';
import {
  getDepartmentBusinessDomains,
  getPositionBusinessPermissions,
  getUnitProjectAssignments,
  updateDepartmentBusinessDomains,
  updatePersonSystemAdmin,
  updatePositionBusinessPermissions,
  updateUnitProjectAssignments,
} from '../controllers/orgAccessController';

const router = express.Router();

router.get('/structure', authenticateToken, getOrgStructure);
router.post('/unit-natures', authenticateToken, requireSystemSettingsAccess, createUnitNature);
router.post('/unit-natures/activate', authenticateToken, requireSystemSettingsAccess, activateUnitNaturesForOrg);
router.delete('/unit-natures/:unitNatureId/activate', authenticateToken, requireSystemSettingsAccess, deactivateUnitNatureForOrg);
router.put('/unit-natures/:unitNatureId', authenticateToken, requireSystemSettingsAccess, renameUnitNature);
router.delete('/unit-natures/:unitNatureId', authenticateToken, requireSystemSettingsAccess, deleteUnitNature);
router.post('/project-types', authenticateToken, requireSystemSettingsAccess, createProjectType);
router.put('/project-types/:projectTypeId', authenticateToken, requireSystemSettingsAccess, renameProjectType);
router.delete('/project-types/:projectTypeId', authenticateToken, requireSystemSettingsAccess, deleteProjectType);
router.post('/construction-natures', authenticateToken, requireSystemSettingsAccess, createConstructionNature);
router.put(
  '/construction-natures/:constructionNatureId',
  authenticateToken,
  requireSystemSettingsAccess,
  renameConstructionNature,
);
router.delete(
  '/construction-natures/:constructionNatureId',
  authenticateToken,
  requireSystemSettingsAccess,
  deleteConstructionNature,
);
router.post('/units', authenticateToken, requireSystemSettingsAccess, createUnit);
router.put('/units/:unitId', authenticateToken, requireSystemSettingsAccess, renameUnit);
router.delete('/units/:unitId', authenticateToken, requireSystemSettingsAccess, deleteUnit);
router.get('/units/:unitId/project-assignments', authenticateToken, requireSystemSettingsAccess, getUnitProjectAssignments);
router.put('/units/:unitId/project-assignments', authenticateToken, requireSystemSettingsAccess, updateUnitProjectAssignments);
router.post('/departments', authenticateToken, requireSystemSettingsAccess, createDepartment);
router.put('/departments/:departmentId', authenticateToken, requireSystemSettingsAccess, renameDepartment);
router.delete('/departments/:departmentId', authenticateToken, requireSystemSettingsAccess, deleteDepartment);
router.get(
  '/departments/:departmentId/business-domains',
  authenticateToken,
  requireSystemSettingsAccess,
  getDepartmentBusinessDomains,
);
router.put(
  '/departments/:departmentId/business-domains',
  authenticateToken,
  requireSystemSettingsAccess,
  updateDepartmentBusinessDomains,
);
router.post('/positions', authenticateToken, requireSystemSettingsAccess, createPosition);
router.put('/positions/:positionId', authenticateToken, requireSystemSettingsAccess, renamePosition);
router.delete('/positions/:positionId', authenticateToken, requireSystemSettingsAccess, deletePosition);
router.get(
  '/positions/:positionId/business-permissions',
  authenticateToken,
  requireSystemSettingsAccess,
  getPositionBusinessPermissions,
);
router.put(
  '/positions/:positionId/business-permissions',
  authenticateToken,
  requireSystemSettingsAccess,
  updatePositionBusinessPermissions,
);
router.get('/unassigned-people', authenticateToken, requireSystemSettingsAccess, getUnassignedPeople);
router.get('/positions/:positionId/people', authenticateToken, requireSystemSettingsAccess, getPositionPeople);
router.put('/people/:userId', authenticateToken, requireSystemSettingsAccess, renamePerson);
router.put('/people/:userId/move', authenticateToken, requireSystemSettingsAccess, movePersonToPosition);
router.put('/people/:userId/system-admin', authenticateToken, requireSystemSettingsAccess, updatePersonSystemAdmin);
router.delete('/positions/:positionId/people/:userId', authenticateToken, requireSystemSettingsAccess, removePersonFromPosition);

export default router;
