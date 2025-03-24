import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, HeadingLevel } from 'docx';
import { TranslationServiceClient } from '@google-cloud/translate';
import openaiService from './openai.service.js';
import soapService from './soap.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class DocumentService {
  constructor() {
    try {
      if (process.env.GOOGLE_CLOUD_CREDENTIALS) {
        const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS);
        this.translationClient = new TranslationServiceClient({ credentials });
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        this.translationClient = new TranslationServiceClient();
      } else {
        console.warn('No Google Cloud credentials found. Translation will not work.');
        this.translationClient = null;
      }
    } catch (error) {
      console.error('Error initializing translation client:', error);
      this.translationClient = null;
    }
  }

  /**
   * Generate a DOCX file from transcription text
   * @param {string} text - The transcription text
   * @param {string} title - The title for the document
   * @returns {Promise<string>} Path to the generated file
   */
  async generateDocument(text, title) {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 32
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: new Date().toLocaleString(),
                size: 24,
                italic: true
              })
            ]
          }),
          new Paragraph({}), // Empty paragraph for spacing
          new Paragraph({
            children: [
              new TextRun({
                text: text
              })
            ]
          })
        ]
      }]
    });

    // Create documents directory if it doesn't exist
    const docsDir = path.join(__dirname, '../documents');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate more user-friendly filename
    const now = new Date();
    const date = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-');
    
    const time = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(':', '');
    
    const cleanTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    const filename = `${cleanTitle}_${date}_${time}.docx`;
    const filepath = path.join(docsDir, filename);

    // Generate document
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filepath, buffer);

    return filepath;
  }

  /**
   * Translate text from Chinese to English
   * @param {string} text - The text to translate
   * @returns {Promise<string>} Translated text
   */
  async translateToEnglish(text) {
    if (!this.translationClient) {
      throw new Error('Translation client not initialized');
    }

    try {
      const projectId = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS).project_id;
      const location = 'global';
      const request = {
        parent: `projects/${projectId}/locations/${location}`,
        contents: [text],
        mimeType: 'text/plain',
        sourceLanguageCode: 'zh',
        targetLanguageCode: 'en-US'
      };

      const [response] = await this.translationClient.translateText(request);
      return response.translations[0].translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('Failed to translate text: ' + error.message);
    }
  }

  /**
   * Process transcription and generate appropriate documents
   * @param {string} text - The transcription text
   * @param {string} language - The language code (e.g., 'en-US', 'zh')
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async processTranscription(text, language) {
    const files = [];

    try {
      if (language === 'zh') {
        // Generate Chinese transcription document
        const chineseFile = await this.generateDocument(
          text,
          'Chinese Transcription'
        );
        files.push(chineseFile);

        // Translate and generate English document
        const translatedText = await this.translateToEnglish(text);
        const englishFile = await this.generateDocument(
          translatedText,
          'English Translation'
        );
        files.push(englishFile);
      } else {
        // Generate English transcription document
        const englishFile = await this.generateDocument(
          text,
          'English Transcription'
        );
        files.push(englishFile);

        // Generate context analysis document
        const analysisFile = await this.generateContextAnalysisDocument(
          text,
          'Context Analysis'
        );
        files.push(analysisFile);

        // Generate SOAP notes document
        const soapFile = await this.generateSOAPDocument(
          text,
          'SOAP Notes'
        );
        files.push(soapFile);
      }

      return files;
    } catch (error) {
      console.error('Error processing transcription:', error);
      throw error;
    }
  }

  /**
   * Clean up generated documents
   * @param {string} filepath - Path to the file to delete
   */
  async cleanup(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Cleaned up file: ${filepath}`);
      }
    } catch (error) {
      console.error('Error cleaning up file:', error);
    }
  }

  async generateContextAnalysisDocument(text, title) {
    try {
      const analysis = await openaiService.analyzeTranscription(text);
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: title,
                  bold: true,
                  size: 32
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: new Date().toLocaleString(),
                  size: 24,
                  italic: true
                })
              ]
            }),
            new Paragraph({}), // Empty paragraph for spacing
            new Paragraph({
              children: [
                new TextRun({
                  text: "Instructions:",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Please fill in the missing context information between the dash (-) and closing bracket (]) in each [NEEDS_CONTEXT] section.",
                  size: 24
                })
              ]
            }),
            new Paragraph({}), // Empty paragraph for spacing
            new Paragraph({
              children: [
                new TextRun({
                  text: "Transcription with Context Markers:",
                  bold: true,
                  size: 28
                })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: analysis.annotatedText,
                  size: 24
                })
              ]
            })
          ]
        }]
      });

      // Create documents directory if it doesn't exist
      const docsDir = path.join(__dirname, '../documents');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const now = new Date();
      const date = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');
      
      const time = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(':', '');

      const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${date}_${time}.docx`;
      const filepath = path.join(docsDir, filename);

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filepath, buffer);

      return filepath;
    } catch (error) {
      console.error('Error generating context analysis document:', error);
      throw error;
    }
  }

  async generateSOAPDocument(text, title) {
    try {
      // First get the context analysis
      const analysis = await openaiService.analyzeTranscription(text);
      
      // Then format it into SOAP notes
      const soapNotes = await soapService.formatToSOAP(analysis.annotatedText);
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: title,
              heading: HeadingLevel.HEADING_1
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: new Date().toLocaleString(),
                  size: 24,
                  italic: true
                })
              ]
            }),
            new Paragraph({}), // Spacing
            // Subjective Section
            new Paragraph({
              text: "SUBJECTIVE",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: soapNotes.subjective,
                  size: 24
                })
              ]
            }),
            new Paragraph({}), // Spacing
            // Objective Section
            new Paragraph({
              text: "OBJECTIVE",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: soapNotes.objective,
                  size: 24
                })
              ]
            }),
            new Paragraph({}), // Spacing
            // Assessment Section
            new Paragraph({
              text: "ASSESSMENT",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: soapNotes.assessment,
                  size: 24
                })
              ]
            }),
            new Paragraph({}), // Spacing
            // Plan Section
            new Paragraph({
              text: "PLAN",
              heading: HeadingLevel.HEADING_2
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: soapNotes.plan,
                  size: 24
                })
              ]
            })
          ]
        }]
      });

      // Create documents directory if it doesn't exist
      const docsDir = path.join(__dirname, '../documents');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }

      const now = new Date();
      const date = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).replace(/\//g, '-');
      
      const time = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(':', '');

      const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${date}_${time}.docx`;
      const filepath = path.join(docsDir, filename);

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filepath, buffer);

      return filepath;
    } catch (error) {
      console.error('Error generating SOAP document:', error);
      throw error;
    }
  }
}

export default new DocumentService(); 