import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { Layout } from './components/Layout'
import './index.css'
import { AtlasProvider, useAtlasState } from './lib/data'
import { CompanyPage } from './pages/Company'
import { Home } from './pages/Home'
import { AboutPage, LoadError, Skeleton } from './pages/Misc'
import { NotFound } from './pages/NotFound'
import { QuestionsPage } from './pages/Questions'
import { TopicPage, TopicsPage } from './pages/Topics'
import { WorkspacePage } from './pages/Workspace'

function AtlasGate({ children }: { children: ReactNode }) {
  const s = useAtlasState()
  if (s.status === 'loading') return <Skeleton />
  if (s.status === 'error') return <LoadError message={s.message} />
  return children
}

const gate = (el: ReactNode) => <AtlasGate>{el}</AtlasGate>

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: gate(<Home />) },
      { path: '/company/:slug', element: gate(<CompanyPage />) },
      { path: '/questions', element: gate(<QuestionsPage />) },
      { path: '/topics', element: gate(<TopicsPage />) },
      { path: '/topics/:topic', element: gate(<TopicPage />) },
      { path: '/q/:id', element: gate(<WorkspacePage />) },
      { path: '/saved', element: <Navigate to="/" replace /> },
      { path: '/about', element: gate(<AboutPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AtlasProvider>
      <RouterProvider router={router} />
    </AtlasProvider>
  </StrictMode>,
)
