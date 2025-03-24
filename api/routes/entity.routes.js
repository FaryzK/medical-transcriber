import express from 'express';
import entityService from '../services/entity.service.js';

const router = express.Router();

/**
 * Extract entities from text
 * @route POST /api/extract-entities
 */
router.post('/extract-entities', async (req, res) => {
  try {
    console.log('Entity extraction request received');
    const { text } = req.body;
    
    if (!text) {
      console.log('No text provided in request');
      return res.status(400).json({
        success: false,
        error: 'No text provided'
      });
    }

    console.log(`Extracting entities from text of length: ${text.length}`);
    console.log(`Text sample: "${text.substring(0, 100)}..."`);
    
    const result = await entityService.extractEntities(text);
    
    if (!result || !result.entities) {
      console.log('Failed to extract entities - no result returned');
      return res.status(500).json({
        success: false,
        error: 'Failed to extract entities'
      });
    }

    console.log(`Successfully extracted ${result.entities.length} entities`);
    // Log a sample of the first few entities
    if (result.entities.length > 0) {
      console.log('Sample entities:');
      result.entities.slice(0, 3).forEach((entity, i) => {
        console.log(`Entity ${i+1}: ${entity.category} - "${entity.text}" (${entity.startIndex}-${entity.endIndex})`);
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