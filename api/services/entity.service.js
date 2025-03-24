import OpenAI from 'openai';

class EntityService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async extractEntities(text) {
    try {
      // Create a version of the text with character positions preserved
      const textForProcessing = text;
      
      console.log(`Extracting entities from: "${textForProcessing}"`);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a medical entity extraction system. Identify and categorize entities in the given text into these categories:

1. PHI (Protected Health Information): Personal identifying information such as names, ages, nationalities, gender identities, and organizations.
2. CONDITION: References to medical conditions, illnesses, diseases, symptoms, or health history.
3. ANATOMY: Mentions of body parts or anatomical locations.
4. MEDICATION: Any mentioned medications, drugs, or pharmaceuticals.
5. PROCEDURE: Tests, treatments, or medical procedures.

Return your analysis as a JSON object with the following structure:
{
  "entities": [
    {
      "text": "the exact text segment character for character",
      "category": "one of: PHI, CONDITION, ANATOMY, MEDICATION, PROCEDURE"
    }
  ]
}

Extract entities precisely - the text string you extract MUST exist exactly in the original text.
Only return entities that clearly fit into one of these categories. Do not modify the original text.`
          },
          {
            role: "user",
            content: textForProcessing
          }
        ],
        temperature: 0.1,
        max_tokens: 1500
      });

      const entityResult = JSON.parse(response.choices[0].message.content);
      
      // Validate and locate entities in the original text
      if (entityResult && entityResult.entities) {
        const processedEntities = entityResult.entities.map(entity => {
          try {
            // Find the entity text in the original text
            const { text: entityText, category } = entity;
            
            // Normalize text for comparison (remove extra spaces and lowercase)
            const normalizedEntityText = entityText.toLowerCase().trim();
            const normalizedFullText = text.toLowerCase();
            
            // Find the entity in the text
            const startIndex = normalizedFullText.indexOf(normalizedEntityText);
            
            if (startIndex === -1) {
              console.warn(`Entity "${entityText}" not found in text`);
              return null;
            }
            
            // Get the exact match from the original text
            const endIndex = startIndex + normalizedEntityText.length;
            const exactText = text.substring(startIndex, endIndex);
            
            return {
              text: exactText,
              category,
              startIndex,
              endIndex
            };
          } catch (e) {
            console.error(`Error processing entity: ${e.message}`);
            return null;
          }
        }).filter(Boolean); // Remove null entries
        
        console.log(`Successfully processed ${processedEntities.length} entities out of ${entityResult.entities.length}`);
        
        return { entities: processedEntities };
      }

      return entityResult;
    } catch (error) {
      console.error('Error extracting entities:', error);
      return { entities: [] };
    }
  }
}

export default new EntityService(); 