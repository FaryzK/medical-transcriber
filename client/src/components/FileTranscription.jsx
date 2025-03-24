import { useState, useRef } from 'react';

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
        setTranscriptionResults(data.results);
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

  const handleClear = () => {
    setTranscriptionResults([]);
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }
  };

  // Function to get combined transcription text
  const getCombinedTranscription = () => {
    return transcriptionResults
      .sort((a, b) => b.confidence - a.confidence) // Sort by confidence score
      .map(result => result.transcript)
      .join(' ');
  };

  // Function to copy transcription to clipboard
  const handleCopyTranscription = () => {
    const text = getCombinedTranscription();
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
      console.log('Transcription copied to clipboard');
    });
  };

  const handleGenerateDocuments = async () => {
    if (!transcriptionResults) return;

    try {
      setIsGeneratingDocuments(true);
      const combinedText = getCombinedTranscription();
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

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to generate documents');
      }

      setGeneratedFiles(data.files);
    } catch (error) {
      console.error('Error generating documents:', error);
      alert('Failed to generate documents: ' + error.message);
    } finally {
      setIsGeneratingDocuments(false);
    }
  };

  const handleDownloadFile = async (filename) => {
    try {
      const response = await fetch(`/api/download-document/${filename}`);
      
      if (!response.ok) {
        throw new Error('File not found');
      }
      
      // Create a blob from the file data
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link and click it to download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file: ' + error.message);
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
            {isProcessing ? 'Processing...' : 'Transcribe'}
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
            {isGeneratingDocuments ? 'Generating...' : 'Generate Documents'}
          </button>
        </div>
      </form>

      {/* Results */}
      {transcriptionResults.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-800">Transcription Results</h3>
            <button
              type="button"
              onClick={() => setShowConfidence(!showConfidence)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showConfidence ? 'Hide Confidence Scores' : 'Show Confidence Scores'}
            </button>
          </div>

          {/* Combined view */}
          <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
              {getCombinedTranscription()}
            </p>
          </div>

          {/* Detailed view with confidence scores */}
          {showConfidence && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Detailed Results:</h4>
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
                    <p className="text-gray-800">{result.transcript}</p>
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
          <div className="space-y-2">
            {generatedFiles.map((file, index) => (
              <button
                key={index}
                onClick={() => handleDownloadFile(file.filename)}
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
                    {file.filename}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 