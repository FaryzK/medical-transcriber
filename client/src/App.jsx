import { useState } from 'react'
import RealTimeTranscription from './components/RealTimeTranscription';

function App() {
  const [apiResponse, setApiResponse] = useState(null);
  const [activeTab, setActiveTab] = useState('realtime'); // 'realtime' or 'test'

  const testApi = async () => {
    try {
      const response = await fetch('/api/test');
      const data = await response.json();
      setApiResponse(data);
    } catch (error) {
      console.error('Error testing API:', error);
      setApiResponse({ error: 'Failed to connect to API' });
    }
  };

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-6">
        Medical Transcriber
      </h1>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button 
          className={`py-2 px-4 font-medium ${activeTab === 'realtime' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('realtime')}
        >
          Real-time Transcription
        </button>
        <button 
          className={`py-2 px-4 font-medium ${activeTab === 'test' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('test')}
        >
          API Test
        </button>
      </div>
      
      {/* Tab content */}
      <div className="mt-4">
        {activeTab === 'realtime' ? (
          <RealTimeTranscription />
        ) : (
          <div className="space-y-4 p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800">API Connection Test</h2>
            <button 
              onClick={testApi}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Test API Connection
            </button>

            {apiResponse && (
              <div className="mt-4 p-4 bg-gray-50 rounded shadow-sm border border-gray-200">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(apiResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
