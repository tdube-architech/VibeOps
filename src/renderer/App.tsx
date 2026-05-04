import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardRoute } from '@/routes/DashboardRoute';
import { ProjectsRoute } from '@/routes/ProjectsRoute';
import { MemoryRoute } from '@/routes/MemoryRoute';
import { AuditsRoute } from '@/routes/AuditsRoute';
import { TasksRoute } from '@/routes/TasksRoute';
import { ChatRoute } from '@/routes/ChatRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: 'projects', element: <ProjectsRoute /> },
      { path: 'memory', element: <MemoryRoute /> },
      { path: 'audits', element: <AuditsRoute /> },
      { path: 'tasks', element: <TasksRoute /> },
      { path: 'chat', element: <ChatRoute /> },
      { path: 'settings', element: <SettingsRoute /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
