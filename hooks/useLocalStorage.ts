
import { useState, useEffect } from 'react';

export function useLocalStorage<T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>, Error | null] {
  const [storageError, setStorageError] = useState<Error | null>(null);

  const getStoredValue = (): T => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      const parsedItem = JSON.parse(item);
      if (Array.isArray(initialValue) && !Array.isArray(parsedItem)) {
        console.warn(`[useLocalStorage] Value for key "${key}" in localStorage was not an array as expected. Resetting to initialValue.`);
        return initialValue;
      }
      return parsedItem;
    } catch (error) {
      console.error(`[useLocalStorage] Error reading localStorage key "${key}":`, error, ". Using initialValue.");
      setStorageError(error as Error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(getStoredValue);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const valueToStore = JSON.stringify(storedValue);
        // console.log(`[useLocalStorage] Persisting to localStorage for key "${key}". Data length: ${valueToStore.length}`);
        window.localStorage.setItem(key, valueToStore);
        if (storageError !== null) { // Clear previous error if save succeeds
            setStorageError(null);
        }
      }
    } catch (errorInstance) {
      const castError = errorInstance as Error;
      console.error(`[useLocalStorage] Error setting localStorage key "${key}":`, castError);
      setStorageError(castError);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue, storageError];
}