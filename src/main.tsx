import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App'
import { createQueryClient, persistOptions } from './data/offline'
import { SessionProvider } from './data/SessionProvider'
import './index.css'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // Replay entry changes queued offline (possibly before a reload), then refresh everything.
      onSuccess={() => queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries())}
    >
      <SessionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SessionProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
