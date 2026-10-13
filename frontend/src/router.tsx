import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import CoachLayout from './layouts/CoachLayout';
import AdminLayout from './layouts/AdminLayout';
import Home from './pages/Home';
import Profile from './pages/Profile';
import Exercises from './pages/Exercises';
import ActiveWorkout from './pages/ActiveWorkout';
import Volume from './pages/Volume';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ChooseUsername from './pages/ChooseUsername';
import ClientDashboard from './pages/client/Dashboard';
import ClientProgram from './pages/client/Program';
import Clients from './pages/coach/Clients';
import Programs from './pages/coach/Programs';
import ProgramBuilder from './pages/coach/ProgramBuilder';
import AdminOverview from './pages/admin/Overview';
import AdminTeam from './pages/admin/Team';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/username', element: <ChooseUsername /> },
      {
        // The base app: a standard training log for any signed-in user, connected to a coach or not.
        // /client is the connected view inside it (phone layout), reachable by everyone and free.
        element: <MainLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/profile', element: <Profile /> },
          { path: '/workouts', element: <Exercises /> },
          { path: '/workouts/:id', element: <ActiveWorkout /> },
          { path: '/volume', element: <Volume /> },
          // History moved onto the Workout (+) page and Settings into the profile; old links still land somewhere sensible.
          { path: '/history', element: <Navigate to="/" replace /> },
          { path: '/settings', element: <Navigate to="/profile" replace /> },
          { path: '/client', element: <ClientDashboard /> },
          { path: '/client/programs/:id', element: <ClientProgram /> },
        ],
      },
      {
        // Coach dashboard (wide layout with sidebar). Anyone can open it; without a coach plan
        // the layout shows the paywall instead of the page (and the database refuses the actions).
        path: '/coach',
        element: <CoachLayout />,
        children: [
          { index: true, element: <Navigate to="/coach/clients" replace /> },
          { path: 'clients', element: <Clients /> },
          { path: 'programs', element: <Programs /> },
          { path: 'programs/:id', element: <ProgramBuilder /> },
        ],
      },
      {
        // Platform admin. Admins only.
        element: <RequireAdmin />,
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminOverview /> },
              { path: 'team', element: <AdminTeam /> },
            ],
          },
        ],
      },
    ],
  },
]);
