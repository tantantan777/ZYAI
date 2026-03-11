import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getProfile, listUsers, updateProfile } from '../controllers/userController';

const router = express.Router();

router.get('/list', authenticateToken, listUsers);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);

export default router;

