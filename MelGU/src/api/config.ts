export const API_CONFIG = {
  BASE_URL: 'http://81.200.144.179:5000/api'
};

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    console.log('Making request to:', url);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Проверяем успешность запроса
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Получаем текст ответа
    const responseText = await response.text();

    // Пытаемся распарсить JSON
    try {
      const data = JSON.parse(responseText);
      return data;
    } catch (parseError) {
      console.error('Response is not valid JSON:', responseText);
      throw new Error(`Invalid JSON response: ${responseText.slice(0, 100)}...`);
    }
  } catch (error) {
    console.error('API Request failed:', {
      endpoint,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}