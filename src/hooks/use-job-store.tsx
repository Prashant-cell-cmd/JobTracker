import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiError,
  createJob as createRemoteJob,
  deleteJob as deleteRemoteJob,
  getJobs,
  importLegacyJobs,
  updateJob as updateRemoteJob,
  updateJobStatus as updateRemoteJobStatus,
} from '../services/jobs-api';
import type { ImportedJob, Job, JobInput, JobStatus } from '../types/job';

export type { Job, JobStatus } from '../types/job';

type JobStore = {
  jobs: Job[];
  isLoaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addJob: (job: JobInput) => Promise<void>;
  updateJob: (id: string, job: JobInput) => Promise<void>;
  updateJobStatus: (id: string, status: JobStatus) => Promise<void>;
  removeJob: (id: string) => Promise<void>;
};

const STORAGE_KEY = 'jobtracker.jobs';
const LOAD_ERROR = 'Could not load applications. Check that the backend is running and try again.';
const SAVE_ERROR = 'Could not save your change. Check the backend connection and try again.';
const JobStoreContext = createContext<JobStore | null>(null);

function isJobStatus(value: unknown): value is JobStatus {
  return value === 'Applied' || value === 'Interview' || value === 'Offer' || value === 'Rejected';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLegacyJobs(value: string): Job[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('Locally saved applications are invalid.');
  }

  return parsed.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.company !== 'string' ||
      typeof item.title !== 'string' ||
      !isJobStatus(item.status) ||
      typeof item.createdAt !== 'string'
    ) {
      throw new Error('Locally saved application data is invalid.');
    }

    return {
      id: item.id,
      company: item.company,
      title: item.title,
      location: typeof item.location === 'string' ? item.location : '',
      salary: typeof item.salary === 'string' ? item.salary : '',
      notes: typeof item.notes === 'string' ? item.notes : '',
      applicationUrl: typeof item.applicationUrl === 'string' ? item.applicationUrl : '',
      resumeName: typeof item.resumeName === 'string' ? item.resumeName : '',
      resumeUri: typeof item.resumeUri === 'string' ? item.resumeUri : '',
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : item.createdAt,
    };
  });
}

async function loadJobsFromApi(token: string): Promise<Job[]> {
  const remoteJobs = await getJobs(token);
  const legacyStorage = await AsyncStorage.getItem(STORAGE_KEY);
  if (legacyStorage === null) return remoteJobs;

  const legacyJobs = parseLegacyJobs(legacyStorage);
  if (legacyJobs.length > 0) {
    const importableJobs: ImportedJob[] = legacyJobs.map(
      ({ updatedAt: _updatedAt, ...job }) => job,
    );
    await importLegacyJobs(token, importableJobs);
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  return legacyJobs.length > 0 ? getJobs(token) : remoteJobs;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function JobStoreProvider({
  children,
  token,
  onSessionExpired,
}: {
  children: ReactNode;
  token: string;
  onSessionExpired: () => Promise<void>;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobsRef = useRef<Job[]>([]);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const isReady = useRef(false);

  const reload = useCallback(async () => {
    isReady.current = false;
    setIsLoaded(false);
    try {
      const loadedJobs = await loadJobsFromApi(token);
      jobsRef.current = loadedJobs;
      setJobs(loadedJobs);
      setError(null);
      isReady.current = true;
    } catch (loadError) {
      setError(getErrorMessage(loadError, LOAD_ERROR));
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onSessionExpired();
      }
    } finally {
      setIsLoaded(true);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    let isMounted = true;
    loadJobsFromApi(token)
      .then((loadedJobs) => {
        if (!isMounted) return;
        jobsRef.current = loadedJobs;
        setJobs(loadedJobs);
        setError(null);
        isReady.current = true;
      })
      .catch((loadError: unknown) => {
        if (isMounted) {
          setError(getErrorMessage(loadError, LOAD_ERROR));
          if (loadError instanceof ApiError && loadError.status === 401) {
            void onSessionExpired();
          }
        }
      })
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [token, onSessionExpired]);

  const mutate = useCallback(async (getNextJobs: (currentJobs: Job[]) => Promise<Job[]>) => {
    if (!isLoaded || !isReady.current) {
      throw new Error('Applications are not connected to the backend yet.');
    }

    const operation = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const nextJobs = await getNextJobs(jobsRef.current);
        jobsRef.current = nextJobs;
        setJobs(nextJobs);
        setError(null);
      });

    writeQueue.current = operation;

    try {
      await operation;
    } catch (saveError) {
      setError(getErrorMessage(saveError, SAVE_ERROR));
      if (saveError instanceof ApiError && saveError.status === 401) {
        await onSessionExpired();
      }
      throw saveError;
    }
  }, [isLoaded, onSessionExpired]);

  const addJob = useCallback(async (job: JobInput) => {
    await mutate(async (currentJobs) => [await createRemoteJob(token, job), ...currentJobs]);
  }, [mutate, token]);

  const updateJob = useCallback(async (id: string, job: JobInput) => {
    await mutate(async (currentJobs) => {
      const updatedJob = await updateRemoteJob(token, id, job);
      return currentJobs.map((currentJob) => currentJob.id === id ? updatedJob : currentJob);
    });
  }, [mutate, token]);

  const updateJobStatus = useCallback(async (id: string, status: JobStatus) => {
    await mutate(async (currentJobs) => {
      const updatedJob = await updateRemoteJobStatus(token, id, status);
      return currentJobs.map((job) => job.id === id ? updatedJob : job);
    });
  }, [mutate, token]);

  const removeJob = useCallback(async (id: string) => {
    await mutate(async (currentJobs) => {
      await deleteRemoteJob(token, id);
      return currentJobs.filter((job) => job.id !== id);
    });
  }, [mutate, token]);

  const value = useMemo(
    () => ({ jobs, isLoaded, error, reload, addJob, updateJob, updateJobStatus, removeJob }),
    [jobs, isLoaded, error, reload, addJob, updateJob, updateJobStatus, removeJob],
  );

  return <JobStoreContext.Provider value={value}>{children}</JobStoreContext.Provider>;
}

export function useJobStore() {
  const store = useContext(JobStoreContext);
  if (!store) {
    throw new Error('useJobStore must be used within JobStoreProvider');
  }
  return store;
}
