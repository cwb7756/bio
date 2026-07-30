// Optimized API hooks with cache strategies to reduce cloud function calls
import { useQuery, useMutation } from '@tanstack/react-query';
import { userApi, courseApi, quizApi, knowledgeApi, achievementApi, feedbackApi } from '../lib/api';

// Query configuration based on data update frequency
export const queryConfig = {
  // Static/Semantically static data - rarely changes
  STATIC: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  },
  
  // Semi-static data (courses, quizzes) - updates occasionally
  SEMISTATIC: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  },
  
  // Dynamic data (users, progress) - changes frequently
  DYNAMIC: {
    staleTime: 1 * 60 * 1000, // 1 minute
    cacheTime: 5 * 60 * 1000, // 5 minutes
  },
  
  // Dashboard stats - real-time sensitive
  REALTIME: {
    staleTime: 30 * 1000, // 30 seconds
    cacheTime: 5 * 60 * 1000, // 5 minutes
  },
};

// ==================== User Hooks ====================
export function useUsers(params, options = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => userApi.list(params),
    staleTime: queryConfig.DYNAMIC.staleTime,
    cacheTime: queryConfig.DYNAMIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useUserDetail(userId, enabled = false) {
  return useQuery({
    queryKey: ['user-detail', userId],
    queryFn: () => userApi.detail(userId),
    staleTime: queryConfig.DYNAMIC.staleTime,
    cacheTime: queryConfig.DYNAMIC.cacheTime,
    enabled: !!userId && enabled,
    meta: { log: true },
  });
}

// ==================== Course Hooks ====================
export function useCourses(params = {}, options = {}) {
  return useQuery({
    queryKey: ['courses', params],
    queryFn: () => courseApi.list(params),
    staleTime: queryConfig.STATIC.staleTime,
    cacheTime: queryConfig.STATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useCourseDetail(courseId, enabled = false) {
  return useQuery({
    queryKey: ['course-detail', courseId],
    queryFn: () => courseApi.detail(courseId),
    staleTime: queryConfig.SEMISTATIC.staleTime,
    cacheTime: queryConfig.SEMISTATIC.cacheTime,
    enabled: !!courseId && enabled,
    meta: { log: true },
  });
}

export function useLessons(courseId, enabled = false) {
  return useQuery({
    queryKey: ['lessons', courseId],
    queryFn: () => courseApi.lessonList(courseId),
    staleTime: queryConfig.SEMISTATIC.staleTime,
    cacheTime: queryConfig.SEMISTATIC.cacheTime,
    enabled: !!courseId && enabled,
    meta: { log: true },
  });
}

// ==================== Quiz Hooks ====================
export function useQuizzes(params = {}, options = {}) {
  return useQuery({
    queryKey: ['quiz', params],
    queryFn: () => quizApi.list(params),
    staleTime: queryConfig.SEMISTATIC.staleTime,
    cacheTime: queryConfig.SEMISTATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useQuizDetail(questionId, enabled = false) {
  return useQuery({
    queryKey: ['quiz-detail', questionId],
    queryFn: () => quizApi.detail(questionId),
    staleTime: queryConfig.SEMISTATIC.staleTime,
    cacheTime: queryConfig.SEMISTATIC.cacheTime,
    enabled: !!questionId && enabled,
    meta: { log: true },
  });
}

// ==================== Knowledge Hooks ====================
export function useKnowledgePoints(options = {}) {
  return useQuery({
    queryKey: ['knowledge-points'],
    queryFn: () => knowledgeApi.listPoints(),
    staleTime: queryConfig.STATIC.staleTime,
    cacheTime: queryConfig.STATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useKnowledgeGraph(options = {}) {
  return useQuery({
    queryKey: ['knowledge-graph'],
    queryFn: () => knowledgeApi.listGraph(),
    staleTime: queryConfig.STATIC.staleTime,
    cacheTime: queryConfig.STATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useFlashcards(options = {}) {
  return useQuery({
    queryKey: ['flashcards'],
    queryFn: () => knowledgeApi.flashcardList(),
    staleTime: queryConfig.STATIC.staleTime,
    cacheTime: queryConfig.STATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

// ==================== Achievement Hooks ====================
export function useAchievements(options = {}) {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: () => achievementApi.list(),
    staleTime: queryConfig.STATIC.staleTime,
    cacheTime: queryConfig.STATIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

export function useAchievementGrants(options = {}) {
  return useQuery({
    queryKey: ['achievement-grants'],
    queryFn: () => achievementApi.grantList(),
    staleTime: queryConfig.DYNAMIC.staleTime,
    cacheTime: queryConfig.DYNAMIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

// ==================== Feedback Hooks ====================
export function useFeedback(params = {}, options = {}) {
  return useQuery({
    queryKey: ['feedback', params],
    queryFn: () => feedbackApi.list(params),
    staleTime: queryConfig.DYNAMIC.staleTime,
    cacheTime: queryConfig.DYNAMIC.cacheTime,
    meta: { log: true },
    ...options,
  });
}

// ==================== Optimistic Mutation Utilities ====================
/**
 * Helper for optimistic updates - cancels existing query and sets new data
 */
export async function cancelAndSetQueryData(queryClient, queryKey, updater) {
  await queryClient.cancelQuery({ queryKey });
  const previousData = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, updater);
  return { previousData };
}

/**
 * Helper for rollback on error
 */
export function rollbackPreviousData(queryClient, queryKey, previousData) {
  if (previousData) {
    queryClient.setQueryData(queryKey, previousData);
  }
}

/**
 * Create optimized mutations with optimistic updates
 */
export function createOptimisticMutation(
  queryClient,
  queryKey,
  mutationFn,
  successOptions = {}
) {
  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Cancel outgoing refetch
      await queryClient.cancelQuery({ queryKey });
      
      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(queryKey);
      
      // Mutate the cache with new value (optimistic update)
      queryClient.setQueryData(queryKey, old => {
        return typeof successOptions.onMutate === 'function' 
          ? successOptions.onMutate(old, variables) 
          : old;
      });
      
      return { previousValue };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousValue) {
        queryClient.setQueryData(queryKey, context.previousValue);
      }
      console.error('Optimistic update failed:', err);
    },
    onSettled: () => {
      // Always refetch to ensure sync after mutation
      queryClient.invalidateQueries({ queryKey });
    },
    ...successOptions,
  });
}
