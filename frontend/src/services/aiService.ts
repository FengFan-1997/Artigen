import { buildApiUrl } from '../utils/api';

const API_URL = buildApiUrl('/api/generate');

export interface AIResponse {
  text: string;
  error?: string;
}

export const generateContent = async (prompt: string): Promise<AIResponse> => {
  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ prompt })
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch {
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
