import { useState, useRef } from 'react';
import { FaSpinner } from 'react-icons/fa';

export default function FileTranscription() {
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcriptionResults, setTranscriptionResults] = useState([]);
  const [showConfidence, setShowConfidence] = useState(false);
  const fileInputRef = useRef(null);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [isGeneratingDocuments, setIsGeneratingDocuments] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState(null);
  const [entities, setEntities] = useState([]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      // Validate file type
      const fileType = selectedFile.type;
      const fileName = selectedFile.name.toLowerCase();
      
      // Check both MIME type and file extension
      const isMP3 = fileType.includes('audio/mp3') || 
                    fileType.includes('audio/mpeg') || 
                    fileName.endsWith('.mp3');
      const isWAV = fileType.includes('audio/wav') || 
                    fileType.includes('audio/wave') || 
                    fileType.includes('audio/x-wav') ||
                    fileName.endsWith('.wav');

      if (!isMP3 && !isWAV) {
        setError('Please select an MP3 or WAV file');
        setFile(null);
        event.target.value = null;
        return;
      }
      
      // Validate file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        setFile(null);
        event.target.value = null;
        return;
      }

      setFile(selectedFile);
      setError(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setEntities([]);
    setTranscriptionResults([]);

    try {
      const formData = new FormData();
      formData.append('audioFile', file);
      formData.append('language', language);

      const response = await fetch('/api/transcribe-file', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process file');
      }

      if (data.success) {
        console.log("Transcription successful, setting results");
        setTranscriptionResults(data.results);
        
        // Check if the response includes entities
        if (data.entities && Array.isArray(data.entities)) {
          console.log(`Server provided ${data.entities.length} entities`, data.entities);
          
          // Get combined text first to validate entities against
          const combinedText = data.results
            .sort((a, b) => b.confidence - a.confidence)
            .map(result => result.transcript)
            .join(' ');
            
          // Validate entities before setting them
          const validEntities = validateEntities(data.entities, combinedText);
          console.log(`Setting ${validEntities.length} valid entities for display`);
          setEntities(validEntities);
        } else {
          console.log("No entities provided by server");
          setEntities([]);
        }
      } else {
        throw new Error(data.error || 'Failed to transcribe file');
      }

      // Reset file input
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = null;
      }

    } catch (error) {
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to validate entities
  const validateEntities = (entityList, text) => {
    if (!entityList || !Array.isArray(entityList) || !text) {
      console.log("Cannot validate entities - missing input:", { 
        hasEntityList: !!entityList, 
        isArray: Array.isArray(entityList), 
        textLength: text ? text.length : 0 
      });
      return [];
    }

    console.log(`Validating ${entityList.length} entities against text of length ${text.length}`);
    
    // First, log a few entities for debugging
    if (entityList.length > 0) {
      console.log("Sample entities to validate:", entityList.slice(0, 3));
    }
    
    const validEntities = entityList.filter(entity => {
      try {
        // Basic validation
        const isValid = entity && 
          typeof entity.startIndex === 'number' && 
          typeof entity.endIndex === 'number' &&
          entity.startIndex >= 0 && 
          entity.endIndex <= text.length &&
          entity.startIndex < entity.endIndex &&
          entity.category &&
          ['PHI', 'CONDITION', 'ANATOMY', 'MEDICATION', 'PROCEDURE'].includes(entity.category);
        
        if (!isValid) {
          console.warn(`Invalid entity:`, entity, 
            entity ? {
              validStart: entity.startIndex >= 0,
              validEnd: entity.endIndex <= text.length,
              validRange: entity.startIndex < entity.endIndex,
              validCategory: entity.category && ['PHI', 'CONDITION', 'ANATOMY', 'MEDICATION', 'PROCEDURE'].includes(entity.category)
            } : 'entity is null');
        }
        
        return isValid;
      } catch (e) {
        console.error('Error validating entity:', e);
        return false;
      }
    });
    
    console.log(`Validation result: ${validEntities.length} valid entities out of ${entityList.length}`);
    return validEntities;
  };

  const handleClear = () => {
    setTranscriptionResults([]);
    setFile(null);
    setError(null);
    setEntities([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  };

  // Function to get combined transcription text
  const getCombinedTranscription = () => {
    if (!transcriptionResults || transcriptionResults.length === 0) {
      console.log("No transcription results to combine");
      return '';
    }
    
    const combined = transcriptionResults
      .sort((a, b) => b.confidence - a.confidence) // Sort by confidence score
      .map(result => result.transcript)
      .join(' ');
      
    console.log("Combined transcription length:", combined.length, "First 40 chars:", combined.substring(0, 40));
    return combined;
  };

  // Function to copy transcription to clipboard
  const handleCopyTranscription = () => {
    const text = getCombinedTranscription();
    navigator.clipboard.writeText(text).then(() => {
      console.log('Transcription copied to clipboard');
    });
  };

  // Function to format text with entities
  const formatTextWithEntities = (text, entityList) => {
    try {
      if (!text || typeof text !== 'string') {
        console.log("No text to format");
        return '';
      }
      
      if (!entityList || !Array.isArray(entityList) || entityList.length === 0) {
        console.log("No entities to format");
        return text;
      }

      console.log("Formatting text with entities:", { 
        textLength: text.length,
        entitiesCount: entityList.length,
        firstFewEntities: entityList.slice(0, 3)
      });

      // Create a safe copy of entities with basic validation
      const safeEntities = entityList.filter(entity => {
        try {
          // Basic validation
          const isValid = entity && 
            typeof entity.startIndex === 'number' && 
            typeof entity.endIndex === 'number' &&
            entity.startIndex >= 0 && 
            entity.endIndex <= text.length &&
            entity.startIndex < entity.endIndex &&
            entity.category &&
            ['PHI', 'CONDITION', 'ANATOMY', 'MEDICATION', 'PROCEDURE'].includes(entity.category);
          
          if (!isValid) {
            console.warn(`Invalid entity:`, entity);
          }
          
          return isValid;
        } catch (e) {
          console.error('Error validating entity:', e);
          return false;
        }
      });
      
      console.log(`Safe entities count: ${safeEntities.length}`);
      if (safeEntities.length === 0) {
        return text;
      }
      
      // Sort entities by startIndex in descending order to avoid index shifting
      const sortedEntities = [...safeEntities].sort((a, b) => b.startIndex - a.startIndex);
      
      let result = text;
      
      // Apply styling to each entity
      for (const entity of sortedEntities) {
        try {
          const { startIndex, endIndex, category } = entity;
          console.log(`Processing entity: ${category} at ${startIndex}-${endIndex}`);
          
          // Verify that indices are within text bounds
          if (startIndex < 0 || endIndex > result.length || startIndex >= endIndex) {
            console.warn(`Entity indices out of bounds: ${startIndex}-${endIndex}, text length: ${result.length}`);
            continue;
          }
          
          // Determine styling based on category
          let style = '';
          switch (category) {
            case 'PHI':
              style = 'color: red;';
              break;
            case 'CONDITION':
              style = 'color: darkgreen;';
              break;
            case 'ANATOMY':
              style = 'font-style: italic;';
              break;
            case 'MEDICATION':
              style = 'background-color: rgba(255, 255, 0, 0.3);';
              break;
            case 'PROCEDURE':
              style = 'color: darkblue;';
              break;
            default:
              continue;
          }
          
          // Insert styled spans
          const before = result.substring(0, startIndex);
          const textSegment = result.substring(startIndex, endIndex);
          const after = result.substring(endIndex);
          
          result = `${before}<span style="${style}" title="${category}: ${textSegment}">${textSegment}</span>${after}`;
          console.log(`Applied formatting for ${category} at position ${startIndex}-${endIndex}: "${textSegment}"`);
        } catch (entityError) {
          console.error('Error formatting entity:', entityError);
          // Continue with next entity if there's an error with this one
        }
      }
      
      console.log(`Formatted text length: ${result.length}`);
      return result;
    } catch (error) {
      console.error('Error in formatTextWithEntities:', error);
      return text || ''; // Return original text if there's an error
    }
  };

  const handleGenerateDocuments = async () => {
    if (!transcriptionResults || transcriptionResults.length === 0) return;

    try {
      setIsGeneratingDocuments(true);
      setGeneratedFiles([]);
      setError(null);
      
      const combinedText = getCombinedTranscription();
      console.log("Generating documents for text:", combinedText.substring(0, 100) + "...");
      
      const response = await fetch('/api/generate-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: combinedText,
          language: language
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      
      console.log("Document generation response:", data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate documents');
      }

      // Process file objects from response
      const files = data.files || [];
      const processedFiles = files.map(file => {
        return typeof file === 'string' 
          ? { name: file, status: 'ready' }
          : { name: file.filename, status: 'ready' };
      });
      
      setGeneratedFiles(processedFiles);
    } catch (error) {
      console.error('Error generating documents:', error);
      setError(`Failed to generate documents: ${error.message}`);
    } finally {
      setIsGeneratingDocuments(false);
    }
  };

  const handleDownloadFile = async (filename) => {
    try {
      // Create a hidden anchor element
      const link = document.createElement('a');
      link.href = `/api/download-document/${filename}`;
      link.download = filename; // Suggest the filename to save as
      link.style.display = 'none';
      document.body.appendChild(link);

      // Trigger the download
      link.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);

      return Promise.resolve();
    } catch (error) {
      console.error('Error downloading file:', error);
      setError(`Failed to download file: ${error.message}`);
      return Promise.reject(error);
    }
  };

  const handleTranscribe = async () => {
    if (!file) return;

    setIsTranscribing(true);
    setError(null);
    setTranscriptionResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const result = await response.json();
      setTranscriptionResult(result);
      
      // Extract entities if transcription is successful
      if (result && result.text) {
        try {
          setIsExtractingEntities(true);
          const entityResponse = await fetch('/api/extract-entities', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: result.text }),
          });
          
          if (entityResponse.ok) {
            const entityData = await entityResponse.json();
            if (entityData.success && entityData.entities) {
              const validEntities = entityData.entities.filter(entity => 
                entity && 
                typeof entity.startIndex === 'number' && 
                typeof entity.endIndex === 'number' &&
                entity.startIndex >= 0 && 
                entity.endIndex <= result.text.length &&
                entity.startIndex < entity.endIndex &&
                entity.category
              );
              setEntities(validEntities);
            }
          }
        } catch (error) {
          console.error('Error extracting entities:', error);
        } finally {
          setIsExtractingEntities(false);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="p-4 space-y-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold text-gray-800">Audio File Transcription</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Language selector */}
        <div>
          <label htmlFor="language" className="block text-sm font-medium text-gray-700">
            Language
          </label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            disabled={isProcessing}
          >
            <option value="en-US">English (US)</option>
            <option value="zh">Mandarin Chinese</option>
          </select>
        </div>

        {/* File input */}
        <div>
          <label htmlFor="audioFile" className="block text-sm font-medium text-gray-700">
            Audio File (MP3 or WAV, max 10MB)
          </label>
          <input
            type="file"
            id="audioFile"
            ref={fileInputRef}
            accept=".mp3,.wav"
            onChange={handleFileChange}
            className="mt-1 block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-medium
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
            disabled={isProcessing}
          />
          {file && (
            <p className="mt-1 text-sm text-gray-500">
              Selected file: {file.name}
            </p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2 text-sm text-red-700 bg-red-100 rounded-md">
            {error}
          </div>
        )}

        {/* Submit and control buttons */}
        <div className="flex space-x-3">
          <button
            type="submit"
            disabled={!file || isProcessing}
            className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 
              ${isProcessing || !file
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
              }`}
          >
            {isProcessing ? (
              <span className="flex items-center">
                Processing
                <FaSpinner className="animate-spin ml-2" />
              </span>
            ) : (
              'Transcribe'
            )}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={!transcriptionResults.length}
            className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !transcriptionResults.length
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            } focus:ring-gray-500`}
          >
            Clear Results
          </button>

          <button
            type="button"
            onClick={handleGenerateDocuments}
            disabled={!transcriptionResults.length || isProcessing || isGeneratingDocuments}
            className={`px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              !transcriptionResults.length || isProcessing || isGeneratingDocuments
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            } focus:ring-green-500`}
          >
            {isGeneratingDocuments ? (
              <span className="flex items-center">
                Generating
                <FaSpinner className="animate-spin ml-2" />
              </span>
            ) : (
              'Generate Documents'
            )}
          </button>
        </div>
      </form>

      {/* Results */}
      {transcriptionResults.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-800">Transcription Results</h3>
            {/* <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleCopyTranscription}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Copy Text
              </button>
              <button
                type="button"
                onClick={() => setShowConfidence(!showConfidence)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showConfidence ? 'Hide Confidence Scores' : 'Show Confidence Scores'}
              </button>
            </div> */}
          </div>

          {/* Formatted transcription view - only show the formatted version */}
          <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            {console.log("Rendering formatted transcription with", entities.length, "entities")}
            <div 
              className="text-gray-800 whitespace-pre-wrap leading-relaxed"
              dangerouslySetInnerHTML={{ 
                __html: formatTextWithEntities(getCombinedTranscription(), entities)
              }}
            />
          </div>

          {/* Entity Legend */}
          <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-4">
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'red'}}>■</span> PHI</div>
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkgreen'}}>■</span> Medical Condition</div>
            <div><span className="inline-block mr-1 italic">I</span> Anatomy</div>
            <div><span className="inline-block w-3 h-3 mr-1 bg-yellow-200"></span> Medication</div>
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkblue'}}>■</span> Procedures/Tests</div>
          </div>

          {/* Detailed view with confidence scores - only shown when user clicks to see them */}
          {showConfidence && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Detailed Results with Confidence Scores:</h4>
              {transcriptionResults
                .sort((a, b) => b.confidence - a.confidence)
                .map((result, index) => (
                  <div 
                    key={index} 
                    className="p-3 bg-gray-50 rounded-md border border-gray-200"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: `rgb(${Math.round(255 - (result.confidence * 255))}, ${Math.round(result.confidence * 255)}, 0)`
                    }}
                  >
                    <div className="text-gray-800">
                      <div
                        dangerouslySetInnerHTML={{ 
                          __html: formatTextWithEntities(result.transcript, entities)
                        }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Confidence: {Math.round(result.confidence * 100)}%
                    </p>
                  </div>
              ))}
            </div>
          )}
        </div>
      )}

      {generatedFiles.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Generated Documents</h3>
          <p className="text-sm text-gray-600 mb-2">Available documents:</p>
          <div className="space-y-2">
            {generatedFiles.map((file, index) => (
              <button
                key={index}
                onClick={() => handleDownloadFile(file.name)}
                className="block w-full text-left px-4 py-2 bg-white hover:bg-gray-50 border rounded-md shadow-sm group"
              >
                <div className="flex items-center space-x-2">
                  <svg 
                    className="w-5 h-5 text-gray-500 group-hover:text-gray-700" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" 
                    />
                  </svg>
                  <span className="text-blue-600 group-hover:text-blue-800 underline">
                    {file.name}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {transcriptionResult && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">Transcription:</h3>
          <div 
            className="whitespace-pre-wrap mb-4 p-4 bg-white rounded-lg border border-gray-200"
            dangerouslySetInnerHTML={{ 
              __html: formatTextWithEntities(transcriptionResult.text, entities)
            }}
          />
          
          {/* Entity Legend */}
          <div className="mt-2 mb-4 text-xs text-gray-500 flex flex-wrap gap-4">
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'red'}}>■</span> PHI</div>
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkgreen'}}>■</span> Medical Condition</div>
            <div><span className="inline-block mr-1 italic">I</span> Anatomy</div>
            <div><span className="inline-block w-3 h-3 mr-1 bg-yellow-200"></span> Medication</div>
            <div><span className="inline-block w-3 h-3 mr-1" style={{color: 'darkblue'}}>■</span> Procedures/Tests</div>
          </div>
          
          <button
            onClick={handleGenerateDocuments}
            disabled={isGeneratingDocuments}
            className="bg-green-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            {isGeneratingDocuments ? (
              <span className="flex items-center">
                Generating
                <FaSpinner className="animate-spin ml-2" />
              </span>
            ) : (
              'Generate Documents'
            )}
          </button>

          {generatedFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold mb-2">Generated Files:</h4>
              <p className="text-sm text-gray-600 mb-2">Available files:</p>
              <ul className="list-disc pl-5">
                {generatedFiles.map((file, index) => (
                  <li key={index} className="mb-2">
                    <button 
                      onClick={() => handleDownloadFile(file.name)}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {file.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 