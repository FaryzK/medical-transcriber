import { useState, useRef } from 'react';

export default function FileTranscription() {
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('en-US');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcriptionResults, setTranscriptionResults] = useState([]);
  const [showConfidence, setShowConfidence] = useState(false);
  const fileInputRef = useRef(null);

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

        {/* Submit button */}
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

          {transcriptionResults.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Clear Results
              </button>
              <button
                type="button"
                onClick={handleCopyTranscription}
                className="px-4 py-2 bg-green-100 text-green-800 font-medium rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Copy Text
              </button>
            </>
          )}
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
    </div>
  );
} 