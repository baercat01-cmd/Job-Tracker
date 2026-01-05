// Simple weather fetching utility
// Uses Open-Meteo free API (no key required)

export interface WeatherData {
  temperature: number;
  description: string;
  icon: string;
}

export async function getWeatherForLocation(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
    );

    if (!response.ok) {
      throw new Error('Weather fetch failed');
    }

    const data = await response.json();
    const temp = Math.round(data.current.temperature_2m);
    const weatherCode = data.current.weather_code;
    const description = getWeatherDescription(weatherCode);

    return `${description}, ${temp}°F`;
  } catch (error) {
    console.error('Error fetching weather:', error);
    return 'Weather unavailable';
  }
}

function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Rain Showers';
  if (code <= 86) return 'Snow Showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Unknown';
}
