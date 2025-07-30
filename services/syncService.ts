import { AppBackup } from '../types';
import { PUBLIC_FESTIVALS_URL } from '../constants';

/**
 * Fetches the latest published festival data for viewer synchronization.
 * @returns A promise that resolves to the AppBackup data structure.
 * @throws An error if the fetch fails or the data format is invalid.
 */
export const syncFestivalsForViewer = async (): Promise<AppBackup> => {
    // Appending a timestamp to the URL to bypass browser cache and ensure fresh data is fetched.
    const url = `${PUBLIC_FESTIVALS_URL}?v=${Date.now()}`;
    
    const response = await fetch(url, {
        cache: 'no-store' // Explicitly tell the browser not to cache this request.
    });

    if (!response.ok) {
        let errorText = await response.text().catch(() => 'Could not read error response body.');
        throw new Error(`Failed to fetch latest data. Status: ${response.status}. Message: ${errorText}`);
    }

    try {
        const data: AppBackup = await response.json();
        if (!data || !Array.isArray(data.festivals)) {
            throw new Error('Invalid data format received from server.');
        }
        return data;
    } catch (e) {
        throw new Error('Failed to parse JSON data from server.');
    }
};
