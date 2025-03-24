import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, BorderStyle, HeadingLevel } from 'docx';
import { TranslationServiceClient } from '@google-cloud/translate';
import openaiService from './openai.service.js';
import soapService from './soap.service.js';
import entityService from './entity.service.js';
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

        // Generate context analysis document from translated text
        const analysisFile = await this.generateContextAnalysisDocument(
          translatedText,
          'Context Analysis'
        );
        files.push(analysisFile);

        // Generate SOAP notes document from translated text
        const soapFile = await this.generateSOAPDocument(
          translatedText,
          'SOAP Notes'
        );
        files.push(soapFile);
      } else {
        // Generate English transcription document
        const englishFile = await this.generateFormattedDocument(
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
      
      // Extract entities from the text
      const entitiesResult = await entityService.extractEntities(text);
      const entities = entitiesResult?.entities || [];
      
      console.log(`Found ${entities.length} entities for context analysis document formatting`);
      
      // Create document children array
      const docChildren = [
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
        new Paragraph({}) // Empty paragraph for spacing
      ];
      
      // Add entity legend if we have entities
      if (entities.length > 0) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Entity Legend:",
                bold: true,
                size: 24
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "PHI (Personal Health Information): ", bold: true }),
              new TextRun({ text: "Red text", color: "FF0000" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "CONDITION: ", bold: true }),
              new TextRun({ text: "Dark green text", color: "006400" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "ANATOMY: ", bold: true }),
              new TextRun({ text: "Italic text", italic: true })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "MEDICATION: ", bold: true }),
              new TextRun({ text: "Yellow highlight", highlight: "yellow" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "PROCEDURE: ", bold: true }),
              new TextRun({ text: "Dark blue text", color: "00008B" })
            ]
          }),
          new Paragraph({}) // Empty paragraph for spacing
        );
      }
      
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Transcription with Context Markers:",
              bold: true,
              size: 28
            })
          ]
        }),
        new Paragraph({}) // Empty paragraph for spacing
      );
      
      // Format the annotated text with entities
      // We need to handle both context markers and entity formatting
      const annotatedText = analysis.annotatedText;
      
      if (entities.length === 0) {
        // If no entities, just add the annotated text
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: annotatedText,
                size: 24
              })
            ]
          })
        );
      } else {
        // Find context markers
        const contextPattern = /\[NEEDS_CONTEXT:(\w+)-([^\]]*)\]/g;
        let matches = [];
        let match;
        
        while ((match = contextPattern.exec(annotatedText)) !== null) {
          matches.push({
            fullMatch: match[0],
            contextType: match[1],
            placeholder: match[2],
            index: match.index,
            length: match[0].length
          });
        }
        
        // We need to treat context markers as special boundary points
        let boundaries = [];
        
        // Add entity boundaries
        for (const entity of entities) {
          boundaries.push({ 
            index: entity.startIndex, 
            isStart: true, 
            isEntity: true,
            entity 
          });
          boundaries.push({ 
            index: entity.endIndex, 
            isStart: false, 
            isEntity: true,
            entity 
          });
        }
        
        // Add context marker boundaries
        for (const marker of matches) {
          boundaries.push({
            index: marker.index,
            isStart: true,
            isEntity: false,
            marker
          });
          boundaries.push({
            index: marker.index + marker.length,
            isStart: false,
            isEntity: false,
            marker
          });
        }
        
        // Sort boundaries by index
        boundaries.sort((a, b) => {
          if (a.index !== b.index) return a.index - b.index;
          // If indices are the same, prioritize end markers before start markers
          if (!a.isStart && b.isStart) return -1;
          if (a.isStart && !b.isStart) return 1;
          return 0;
        });
        
        // Process text segments
        let segments = [];
        let lastIndex = 0;
        let activeEntities = new Map();
        let activeMarkers = new Map();
        
        for (const boundary of boundaries) {
          // Add text segment before this boundary
          if (boundary.index > lastIndex) {
            const segment = annotatedText.substring(lastIndex, boundary.index);
            const activeEntity = Array.from(activeEntities.values())[0]; // Get the topmost active entity if any
            const activeMarker = Array.from(activeMarkers.values())[0]; // Get the topmost active marker if any
            
            segments.push({
              text: segment,
              entity: activeEntity,
              marker: activeMarker
            });
          }
          
          // Update active entities/markers
          if (boundary.isEntity) {
            if (boundary.isStart) {
              activeEntities.set(boundary.entity.startIndex, boundary.entity);
            } else {
              activeEntities.delete(boundary.entity.startIndex);
            }
          } else {
            if (boundary.isStart) {
              activeMarkers.set(boundary.marker.index, boundary.marker);
            } else {
              activeMarkers.delete(boundary.marker.index);
            }
          }
          
          lastIndex = boundary.index;
        }
        
        // Add final segment
        if (lastIndex < annotatedText.length) {
          segments.push({
            text: annotatedText.substring(lastIndex),
            entity: undefined,
            marker: undefined
          });
        }
        
        // Create text runs for each segment
        const textRuns = [];
        
        for (const segment of segments) {
          let textRun;
          
          if (segment.marker) {
            // Marker formatting takes precedence
            textRun = new TextRun({
              text: segment.text,
              bold: true,
              color: "0000FF", // Blue for context markers
              size: 24
            });
          } else if (segment.entity) {
            // Entity formatting
            switch (segment.entity.category) {
              case 'PHI':
                textRun = new TextRun({
                  text: segment.text,
                  color: "FF0000", // Red
                  size: 24
                });
                break;
              case 'CONDITION':
                textRun = new TextRun({
                  text: segment.text,
                  color: "006400", // Dark green
                  size: 24
                });
                break;
              case 'ANATOMY':
                textRun = new TextRun({
                  text: segment.text,
                  italic: true,
                  size: 24
                });
                break;
              case 'MEDICATION':
                textRun = new TextRun({
                  text: segment.text,
                  highlight: "yellow",
                  size: 24
                });
                break;
              case 'PROCEDURE':
                textRun = new TextRun({
                  text: segment.text,
                  color: "00008B", // Dark blue
                  size: 24
                });
                break;
              default:
                textRun = new TextRun({
                  text: segment.text,
                  size: 24
                });
            }
          } else {
            // Normal text
            textRun = new TextRun({
              text: segment.text,
              size: 24
            });
          }
          
          textRuns.push(textRun);
        }
        
        docChildren.push(
          new Paragraph({
            children: textRuns
          })
        );
      }
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: docChildren
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
      
      // Extract entities from the text
      const entitiesResult = await entityService.extractEntities(text);
      const entities = entitiesResult?.entities || [];
      
      console.log(`Found ${entities.length} entities for SOAP document formatting`);
      
      // Then format it into SOAP notes
      const soapNotes = await soapService.formatToSOAP(analysis.annotatedText);
      
      // Helper function to format text with entities
      const createFormattedParagraph = (sectionText) => {
        // If no entities or empty text, return simple paragraph
        if (!sectionText || entities.length === 0) {
          return new Paragraph({
            children: [
              new TextRun({
                text: sectionText || "",
                size: 24
              })
            ]
          });
        }
        
        // Find entities that appear in this section
        const sectionEntities = entities.filter(entity => {
          // Skip single-letter entities to avoid false positives
          if (entity.text.length <= 1) return false;
          
          // Use word boundary regex to ensure we match whole words
          const regex = new RegExp(`\\b${entity.text}\\b`, 'i');
          return regex.test(sectionText);
        });
        
        if (sectionEntities.length === 0) {
          return new Paragraph({
            children: [
              new TextRun({
                text: sectionText,
                size: 24
              })
            ]
          });
        }
        
        // Map each entity to its occurrences in the section text
        let sectionEntityRanges = [];
        
        for (const entity of sectionEntities) {
          // Use word boundary regex to find all occurrences
          const regex = new RegExp(`\\b${entity.text}\\b`, 'gi');
          let match;
          
          while ((match = regex.exec(sectionText)) !== null) {
            sectionEntityRanges.push({
              startIndex: match.index,
              endIndex: match.index + match[0].length,
              entity
            });
          }
        }
        
        // Sort by start index
        sectionEntityRanges.sort((a, b) => a.startIndex - b.startIndex);
        
        // Break into segments
        let segments = [];
        let lastIndex = 0;
        
        for (const range of sectionEntityRanges) {
          // Add text before entity
          if (range.startIndex > lastIndex) {
            segments.push({
              text: sectionText.substring(lastIndex, range.startIndex),
              entity: null
            });
          }
          
          // Add entity text
          segments.push({
            text: sectionText.substring(range.startIndex, range.endIndex),
            entity: range.entity
          });
          
          lastIndex = range.endIndex;
        }
        
        // Add any remaining text
        if (lastIndex < sectionText.length) {
          segments.push({
            text: sectionText.substring(lastIndex),
            entity: null
          });
        }
        
        // Create text runs for each segment
        const textRuns = segments.map(segment => {
          if (!segment.entity) {
            return new TextRun({
              text: segment.text,
              size: 24
            });
          }
          
          // Format based on entity category
          switch (segment.entity.category) {
            case 'PHI':
              return new TextRun({
                text: segment.text,
                color: "FF0000", // Red
                size: 24
              });
            case 'CONDITION':
              return new TextRun({
                text: segment.text,
                color: "006400", // Dark green
                size: 24
              });
            case 'ANATOMY':
              return new TextRun({
                text: segment.text,
                italic: true,
                size: 24
              });
            case 'MEDICATION':
              return new TextRun({
                text: segment.text,
                highlight: "yellow",
                size: 24
              });
            case 'PROCEDURE':
              return new TextRun({
                text: segment.text,
                color: "00008B", // Dark blue
                size: 24
              });
            default:
              return new TextRun({
                text: segment.text,
                size: 24
              });
          }
        });
        
        return new Paragraph({
          children: textRuns
        });
      };
      
      // Create children array for document
      const docChildren = [
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
        new Paragraph({}) // Spacing
      ];
      
      // Add entity legend
      if (entities.length > 0) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Entity Legend:",
                bold: true,
                size: 24
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "PHI (Personal Health Information): ", bold: true }),
              new TextRun({ text: "Red text", color: "FF0000" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "CONDITION: ", bold: true }),
              new TextRun({ text: "Dark green text", color: "006400" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "ANATOMY: ", bold: true }),
              new TextRun({ text: "Italic text", italic: true })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "MEDICATION: ", bold: true }),
              new TextRun({ text: "Yellow highlight", highlight: "yellow" })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "• ", bold: true }),
              new TextRun({ text: "PROCEDURE: ", bold: true }),
              new TextRun({ text: "Dark blue text", color: "00008B" })
            ]
          }),
          new Paragraph({}) // Spacing
        );
      }
      
      // Subjective Section
      docChildren.push(
        new Paragraph({
          text: "SUBJECTIVE",
          heading: HeadingLevel.HEADING_2
        }),
        createFormattedParagraph(soapNotes.subjective),
        new Paragraph({}) // Spacing
      );
      
      // Objective Section
      docChildren.push(
        new Paragraph({
          text: "OBJECTIVE",
          heading: HeadingLevel.HEADING_2
        }),
        createFormattedParagraph(soapNotes.objective),
        new Paragraph({}) // Spacing
      );
      
      // Assessment Section
      docChildren.push(
        new Paragraph({
          text: "ASSESSMENT",
          heading: HeadingLevel.HEADING_2
        }),
        createFormattedParagraph(soapNotes.assessment),
        new Paragraph({}) // Spacing
      );
      
      // Plan Section
      docChildren.push(
        new Paragraph({
          text: "PLAN",
          heading: HeadingLevel.HEADING_2
        }),
        createFormattedParagraph(soapNotes.plan)
      );
      
      const doc = new Document({
        sections: [{
          properties: {},
          children: docChildren
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

  /**
   * Generate a DOCX file with entity formatting
   * @param {string} text - The transcription text
   * @param {string} title - The title for the document
   * @returns {Promise<string>} Path to the generated file
   */
  async generateFormattedDocument(text, title) {
    try {
      // Extract entities from the text
      const entitiesResult = await entityService.extractEntities(text);
      const entities = entitiesResult?.entities || [];
      
      console.log(`Found ${entities.length} entities for document formatting`);
      
      // Sort entities by start index (in reverse order to avoid index shifting)
      const sortedEntities = [...entities].sort((a, b) => b.startIndex - a.startIndex);
      
      // Create document paragraphs
      const docChildren = [
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
      ];
      
      // Create a legend for entity categories
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Entity Legend:",
              bold: true,
              size: 24
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "• ", bold: true }),
            new TextRun({ text: "PHI (Personal Health Information): ", bold: true }),
            new TextRun({ text: "Red text", color: "FF0000" })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "• ", bold: true }),
            new TextRun({ text: "CONDITION: ", bold: true }),
            new TextRun({ text: "Dark green text", color: "006400" })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "• ", bold: true }),
            new TextRun({ text: "ANATOMY: ", bold: true }),
            new TextRun({ text: "Italic text", italic: true })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "• ", bold: true }),
            new TextRun({ text: "MEDICATION: ", bold: true }),
            new TextRun({ text: "Yellow highlight", highlight: "yellow" })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "• ", bold: true }),
            new TextRun({ text: "PROCEDURE: ", bold: true }),
            new TextRun({ text: "Dark blue text", color: "00008B" })
          ]
        }),
        new Paragraph({}), // Empty paragraph for spacing
        new Paragraph({
          children: [
            new TextRun({
              text: "Transcription:",
              bold: true,
              size: 28
            })
          ]
        }),
        new Paragraph({}) // Empty paragraph for spacing
      );
      
      // If no entities, just add the plain text
      if (entities.length === 0) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                size: 24
              })
            ]
          })
        );
      } else {
        // Break the text into segments based on entity positions
        let segments = [];
        let lastIndex = 0;
        
        // Create a flattened array of all entity boundaries
        let boundaries = [];
        for (const entity of entities) {
          boundaries.push({ index: entity.startIndex, isStart: true, entity });
          boundaries.push({ index: entity.endIndex, isStart: false, entity });
        }
        
        // Sort boundaries by index
        boundaries.sort((a, b) => a.index - b.index);
        
        // Keep track of active entities at each point
        let activeEntities = new Map();
        
        // Process text segments
        for (const boundary of boundaries) {
          // Add text segment before this boundary
          if (boundary.index > lastIndex) {
            const segment = text.substring(lastIndex, boundary.index);
            const activeEntity = Array.from(activeEntities.values())[0]; // Get the topmost active entity if any
            
            segments.push({
              text: segment,
              entity: activeEntity // Can be undefined if no active entity
            });
          }
          
          // Update active entities
          if (boundary.isStart) {
            activeEntities.set(boundary.entity.startIndex, boundary.entity);
          } else {
            activeEntities.delete(boundary.entity.startIndex);
          }
          
          lastIndex = boundary.index;
        }
        
        // Add final segment
        if (lastIndex < text.length) {
          segments.push({
            text: text.substring(lastIndex),
            entity: undefined
          });
        }
        
        // Create paragraph with formatted text runs
        const textRuns = segments.map(segment => {
          if (!segment.entity) {
            return new TextRun({
              text: segment.text,
              size: 24
            });
          }
          
          // Format based on entity category
          switch (segment.entity.category) {
            case 'PHI':
              return new TextRun({
                text: segment.text,
                color: "FF0000", // Red
                size: 24
              });
            case 'CONDITION':
              return new TextRun({
                text: segment.text,
                color: "006400", // Dark green
                size: 24
              });
            case 'ANATOMY':
              return new TextRun({
                text: segment.text,
                italic: true,
                size: 24
              });
            case 'MEDICATION':
              return new TextRun({
                text: segment.text,
                highlight: "yellow",
                size: 24
              });
            case 'PROCEDURE':
              return new TextRun({
                text: segment.text,
                color: "00008B", // Dark blue
                size: 24
              });
            default:
              return new TextRun({
                text: segment.text,
                size: 24
              });
          }
        });
        
        docChildren.push(
          new Paragraph({
            children: textRuns
          })
        );
      }
      
      // Create the document
      const doc = new Document({
        sections: [{
          properties: {},
          children: docChildren
        }]
      });
      
      // Create documents directory if it doesn't exist
      const docsDir = path.join(__dirname, '../documents');
      if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
      }
      
      // Generate filename
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
    } catch (error) {
      console.error('Error generating formatted document:', error);
      // Fall back to regular document generation
      return this.generateDocument(text, title);
    }
  }
}

export default new DocumentService(); 