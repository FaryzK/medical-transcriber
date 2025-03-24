import OpenAI from 'openai';

// Define context types - easy to add more in the future
const CONTEXT_TYPES = {
  TOOTH_NUMBER: {
    pattern: /\b(this|that|the) tooth\b/i,
    prompt: "Which tooth number?",
    example: {
      original: "this tooth needs extraction",
      withContext: "[NEEDS_CONTEXT: Which tooth number? - ] needs extraction"
    }
  }
  // Add more context types here as needed, for example:
  // TOOTH_SURFACE: {
  //   pattern: /\b(this|that|the) surface\b/i,
  //   prompt: "Which tooth surface?",
  //   example: "..."
  // }
};

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async analyzeTranscription(text) {
    try {
      const contextTypesDescription = Object.entries(CONTEXT_TYPES)
        .map(([key, value]) => {
          return `${key}:
          - Pattern: ${value.pattern}
          - Prompt: "${value.prompt}"
          - Example:
            Original: "${value.example.original}"
            With context: "${value.example.withContext}"`;
        })
        .join('\n\n');

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a dental documentation assistant specializing in identifying areas in transcriptions that need more context. 

            Focus on the following context types:
            ${contextTypesDescription}

            Add inline context placeholders in the text using this format:
            [NEEDS_CONTEXT: Brief question or prompt - ]

            Guidelines:
            1. Focus ONLY on the defined context types above
            2. Place the dash and space after it ("- ") to make it easy for doctors to fill in the information
            3. Keep the original text structure and only add the context markers
            4. Don't modify any other parts of the text

            Return the text with these inline context markers as a single string in the 'annotatedText' field of a JSON object.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content);
      return { annotatedText: result.annotatedText };
    } catch (error) {
      console.error('Error analyzing transcription:', error);
      throw new Error('Failed to analyze transcription');
    }
  }
}

export default new OpenAIService(); 