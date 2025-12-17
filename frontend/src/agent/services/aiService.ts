import type { ChatMessage } from '../types';
import { getUserId } from '../utils/user';
import { getPageContext } from '../utils/pageContext';
import { projectKnowledge } from '../data/projectKnowledge';

const API_URL = 'http://localhost:8080/api/chat';
const USER_API_URL = 'http://localhost:8080/api/user';

export const sendMessageToAI = async (
  message: string,
  _history: ChatMessage[] = [] // Kept for compatibility but not strictly needed for backend context
): Promise<string> => {
  try {
    const userId = getUserId();
    const pageContext = getPageContext();

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        userId,
        pageContext, // Send current page state
        projectKnowledge // Send project knowledge
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend Error:', errorText);
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // The backend now returns { reply: string }
    if (data.reply) {
      return data.reply;
    }

    return "I'm not sure what to say...";
  } catch (error) {
    console.error('Error calling AI:', error);
    return "Sorry, I'm having trouble connecting to my brain right now! 😵‍💫";
  }
};

export const getUserProfile = async () => {
  try {
    const userId = getUserId();
    const response = await fetch(`${USER_API_URL}/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch profile');
    return await response.json();
  } catch (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
};

export const getChatHistory = async (userId: string) => {
  try {
    const response = await fetch(`http://localhost:8080/api/chat/history/${userId}`);
    if (!response.ok) throw new Error('Failed to fetch history');
    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
};

export const updateUserProfile = async (profile: any) => {
  try {
    const userId = getUserId();
    const response = await fetch(USER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, profile })
    });
    if (!response.ok) throw new Error('Failed to update profile');
    return await response.json();
  } catch (error) {
    console.error('Error updating profile:', error);
    return null;
  }
};
