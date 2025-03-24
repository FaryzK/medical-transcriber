import OpenAI from 'openai';

class SOAPService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async formatToSOAP(text) {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a medical documentation assistant specializing in formatting transcriptions into SOAP notes.

            Format the input text into these sections while maintaining any context placeholders ([NEEDS_CONTEXT]) exactly where they appear in the original text:
            
            SUBJECTIVE (S):
            - Chief complaint and history of present illness
            - Patient's reported symptoms and concerns
            - Relevant medical history
            - Review of systems as reported by patient
            
            OBJECTIVE (O):
            - Vital signs and measurements
            - Physical examination findings
            - Laboratory or diagnostic test results
            - Observable clinical findings
            
            ASSESSMENT (A):
            - Primary diagnosis and differential diagnoses
            - Clinical reasoning and analysis
            - Current status of conditions
            - Risk factors and complications
            
            PLAN (P):
            - Treatment recommendations
            - Medications prescribed
            - Diagnostic tests ordered
            - Follow-up instructions
            - Patient education provided
            - Referrals if needed

            Guidelines:
            1. Preserve all [NEEDS_CONTEXT] markers in their original location within the text
            2. Organize information chronologically within each section
            3. Use bullet points for clarity
            4. If information for a section is not available, note "No information provided"
            5. Maintain all medical terminology intact
            6. Keep context requests (e.g., [NEEDS_CONTEXT]) exactly where they appear in the original text

            Return the formatted notes as a JSON object with sections as keys:
            {
              "subjective": "...",
              "objective": "...",
              "assessment": "...",
              "plan": "..."
            }`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Error formatting SOAP notes:', error);
      throw new Error('Failed to format SOAP notes');
    }
  }
}

export default new SOAPService(); 