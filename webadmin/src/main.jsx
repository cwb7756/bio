import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import './index.css'
import { Toaster } from './components/ui/toaster'

// Query Client Configuration
// Optimized cache strategies to reduce cloud function calls and database queries
const queryClient = new QueryClient({
  defaultOptions: {
    // Global defaults for all queries
    queries: {
      retry: 2, // Retry failed requests 2 times
      refetchOnWindowFocus: false, // Disable window focus refetch (improves performance)
      staleTime: 60 * 1000, // Default: data is fresh for 1 minute
      cacheTime: 5 * 60 * 1000, // Default: keep cached data for 5 minutes
      gcDelayTime: 30 * 1000, // Garbage collection delay: 30 seconds
      meta: {
        log: true, // Track query performance in console
      },
    },
    // Mutations configuration
    mutations: {
      retry: false, // Don't retry mutations (optimistic updates handle errors)
    },
  },
  
  // Network status monitoring
  networkMode: 'online', // Only fetch when online
})

export { queryClient }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
