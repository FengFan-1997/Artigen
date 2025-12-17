const API_URL = '/api/generate';

export interface AIResponse {
  text: string;
  error?: string;
}

export const generateContent = async (prompt: string): Promise<AIResponse> => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch (e) {
        const text = await response.text();
        if (text) errorMsg += ` - ${text.slice(0, 200)}`;
      }
      return { text: '', error: errorMsg };
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      const fallbackText = await response.text();
      const errorMsg =
        fallbackText && fallbackText.trim().length > 0
          ? `Invalid JSON response: ${fallbackText.slice(0, 200)}`
          : 'Invalid JSON response from server';
      return { text: '', error: errorMsg };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text };
  } catch (error: any) {
    return { text: '', error: error.message || 'Unknown error occurred' };
  }
};
