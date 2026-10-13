import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import '@fontsource-variable/outfit'
import { router } from './router'
import { ActiveWorkoutProvider } from './context/ActiveWorkoutContext'
import { AuthProvider } from './context/AuthContext'
import './index.scss'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ActiveWorkoutProvider>
        <RouterProvider router={router} />
      </ActiveWorkoutProvider>
    </AuthProvider>
  </StrictMode>,
)
