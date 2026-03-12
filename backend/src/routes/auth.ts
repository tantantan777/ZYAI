import express from 'express';
import { getRegistrationOrgStructure, sendCode, login, verify } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.post('/send-code', sendCode);
router.post('/login', login);
router.get('/registration-org-structure', getRegistrationOrgStructure);
router.get('/verify', authMiddleware, verify);

export default router;
