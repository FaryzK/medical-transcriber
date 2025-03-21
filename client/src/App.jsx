import { useState } from 'react'

function App() {
  const [apiResponse, setApiResponse] = useState(null);

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
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold text-blue-600 mb-4">
        Medical Transcriber
      </h1>
      
      <div className="space-y-4">
        <button 
          onClick={testApi}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Test API Connection
        </button>

        {apiResponse && (
          <div className="mt-4 p-4 bg-white rounded shadow">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
