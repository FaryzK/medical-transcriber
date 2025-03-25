import express from 'express';
import { extractEntities } from '../controllers/entity.controller.js';

const router = express.Router();

/**
 * Extract entities from text
 * @route POST /api/extract-entities
 */
router.post('/extract-entities', extractEntities);

export default router; 