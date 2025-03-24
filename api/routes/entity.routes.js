import express from 'express';
import entityService from '../services/entity.service.js';

const router = express.Router();

/**
 * Extract entities from text
 * @route POST /api/extract-entities
 */
router.post('/extract-entities', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No text provided'
      });
    }

    const result = await entityService.extractEntities(text);
    
    if (!result || !result.entities) {
      return res.status(500).json({
        success: false,
        error: 'Failed to extract entities'
      });
    }

    res.json({
      success: true,
      entities: result.entities
    });
  } catch (error) {
    console.error('Error extracting entities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router; 