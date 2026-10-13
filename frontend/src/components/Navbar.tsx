import { NavLink } from 'react-router-dom';
import { FaUser, FaClipboardList, FaPlus, FaDumbbell, FaChartBar } from 'react-icons/fa';
import type { ReactNode } from 'react';

const TABS: { to: string; label: string; icon: ReactNode; end?: boolean }[] = [
  { to: '/profile', label: 'Profile', icon: <FaUser /> },
  { to: '/volume', label: 'Volume', icon: <FaChartBar /> },
  { to: '/', label: 'Workout', icon: <FaPlus />, end: true },
  { to: '/workouts', label: 'Exercises', icon: <FaDumbbell />, end: true },
  { to: '/client', label: 'From your coach', icon: <FaClipboardList /> },
];

export function Navbar() {
  return (
    <nav aria-label="Main">
      <ul>
        {TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink to={tab.to} end={tab.end} aria-label={tab.label} title={tab.label}>
              {tab.icon}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
