
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { FestivalInfo } from '../types';
import {
  initDB,
  getAllFestivals as getAllFestivalsDB,
  addFestival as addFestivalDB,
  updateFestival as updateFestivalDB,
  deleteFestival as deleteFestivalDB,
  clearFestivals as clearFestivalsDB,
  bulkAddFestivals as bulkAddFestivalsDB,
  isMigrationDone,
  markMigrationAsDone
} from '../services/indexedDbService';

const OLD_LOCALSTORAGE_FESTIVALS_KEY = 'festivals';

interface FestivalsContextType {
  festivals: FestivalInfo[];
  addFestival: (festival: FestivalInfo) => Promise<void>;
  updateFestival: (updatedFestival: FestivalInfo) => Promise<void>;
  deleteFestival: (id: string) => Promise<void>;
  replaceAllFestivals: (newFestivals: FestivalInfo[], options?: { setGlobalLoading?: boolean }) => Promise<void>;
  getFestivalById: (id: string) => FestivalInfo | undefined;
  isLoading: boolean;
  dbError: Error | null; // Renamed from storageError for clarity
}

const FestivalsContext = createContext<FestivalsContextType | undefined>(undefined);

export const FestivalsProvider: React.FC<{ children: ReactNode, onFestivalsChange?: (festivals: FestivalInfo[]) => void }> = ({ children, onFestivalsChange }) => {
  const [festivals, setFestivals] = useState<FestivalInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [dbError, setDbError] = useState<Error | null>(null);

  const performMigration = useCallback(async () => {
    if (typeof window !== 'undefined' && !isMigrationDone()) {
      console.log('[Migration] Checking for data in localStorage...');
      try {
        const lsDataString = localStorage.getItem(OLD_LOCALSTORAGE_FESTIVALS_KEY);
        if (lsDataString) {
          const lsFestivals: FestivalInfo[] = JSON.parse(lsDataString);
          if (Array.isArray(lsFestivals) && lsFestivals.length > 0) {
            console.log(`[Migration] Found ${lsFestivals.length} festivals in localStorage. Migrating to IndexedDB...`);
            await bulkAddFestivalsDB(lsFestivals); // Add to IDB
            localStorage.removeItem(OLD_LOCALSTORAGE_FESTIVALS_KEY); // Remove from LS
            markMigrationAsDone(); // Mark migration as done
            console.log('[Migration] Successfully migrated data from localStorage to IndexedDB and removed old LS data.');
            return lsFestivals; // Return migrated festivals to immediately populate state
          } else {
            console.log('[Migration] No valid festival data in localStorage to migrate.');
            markMigrationAsDone(); // Mark as done even if no data, to avoid re-checking
          }
        } else {
          console.log('[Migration] No festival data found in localStorage.');
          markMigrationAsDone(); // Mark as done to avoid re-checking
        }
      } catch (error) {
        console.error('[Migration] Error during migration from localStorage to IndexedDB:', error);
        // Don't throw, allow app to continue with (potentially empty) IDB
        // User might need to re-import data if migration failed badly.
      }
    }
    return null; // No data migrated or migration already done
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setDbError(null);
      try {
        await initDB();
        
        let migratedFestivals: FestivalInfo[] | null = null;
        if (!isMigrationDone()) {
          migratedFestivals = await performMigration();
        }

        if (migratedFestivals) {
          setFestivals(migratedFestivals);
        } else {
          const dbFestivals = await getAllFestivalsDB();
          setFestivals(dbFestivals);
        }
        // console.log('[FestivalsContext] Data loaded from IndexedDB.');
      } catch (error: any) {
        console.error('[FestivalsContext] Error loading data from IndexedDB:', error);
        setDbError(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [performMigration]);

  useEffect(() => {
    if (onFestivalsChange) {
      onFestivalsChange(festivals);
    }
  }, [festivals, onFestivalsChange]);

  const addFestival = useCallback(async (festival: FestivalInfo) => {
    setDbError(null);
    try {
      await addFestivalDB(festival);
      setFestivals(prev => [...prev, festival]);
    } catch (error: any) {
      console.error('[FestivalsContext] Error adding festival to DB:', error);
      setDbError(error);
      throw error; // Re-throw for component-level handling if needed
    }
  }, []);

  const updateFestival = useCallback(async (updatedFestival: FestivalInfo) => {
    setDbError(null);
    try {
      await updateFestivalDB(updatedFestival);
      setFestivals(prev => prev.map(f => f.id === updatedFestival.id ? updatedFestival : f));
    } catch (error: any) {
      console.error('[FestivalsContext] Error updating festival in DB:', error);
      setDbError(error);
      throw error;
    }
  }, []);

  const deleteFestival = useCallback(async (idToDelete: string) => {
    setDbError(null);
    try {
      await deleteFestivalDB(idToDelete);
      setFestivals(prev => prev.filter(f => f.id !== idToDelete));
    } catch (error: any) {
      console.error('[FestivalsContext] Error deleting festival from DB:', error);
      setDbError(error);
      throw error;
    }
  }, []);

  const replaceAllFestivals = useCallback(async (
    newFestivals: FestivalInfo[], 
    options?: { setGlobalLoading?: boolean }
  ) => {
    const shouldSetGlobalLoading = options?.setGlobalLoading !== false;
    if (shouldSetGlobalLoading) {
        setIsLoading(true);
    }
    setDbError(null);
    try {
      await clearFestivalsDB();
      if (newFestivals.length > 0) {
        await bulkAddFestivalsDB(newFestivals);
      }
      setFestivals(newFestivals);
    } catch (error: any) {
      console.error('[FestivalsContext] Error replacing all festivals in DB:', error);
      setDbError(error);
      // Attempt to reload from DB to ensure consistency if bulk add failed partially
      try {
          const currentDbFestivals = await getAllFestivalsDB();
          setFestivals(currentDbFestivals);
      } catch (reloadError) {
          console.error('[FestivalsContext] Error reloading festivals after replaceAll failure:', reloadError);
      }
      throw error; // Re-throw for component-level handling if needed
    } finally {
      if (shouldSetGlobalLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  const getFestivalById = useCallback((id: string): FestivalInfo | undefined => {
    return festivals.find(f => f.id === id);
  }, [festivals]);

  const contextValue = useMemo(() => ({
    festivals,
    addFestival,
    updateFestival,
    deleteFestival,
    replaceAllFestivals,
    getFestivalById,
    isLoading,
    dbError
  }), [festivals, addFestival, updateFestival, deleteFestival, replaceAllFestivals, getFestivalById, isLoading, dbError]);

  return (
    <FestivalsContext.Provider value={contextValue}>
      {children}
    </FestivalsContext.Provider>
  );
};

export const useFestivals = (): FestivalsContextType => {
  const context = useContext(FestivalsContext);
  if (!context) {
    throw new Error('useFestivals must be used within a FestivalsProvider');
  }
  return context;
};
