import { lazy, Suspense } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { TabLayout } from './app/TabLayout';
import { FullLayout } from './app/FullLayout';
import { TodayScreen } from './screens/today/TodayScreen';
import { GoalsScreen } from './screens/goals/GoalsScreen';
import { GoalDetailScreen } from './screens/goals/GoalDetailScreen';
import { GoalFormScreen } from './screens/goals/GoalFormScreen';
import { GoalEditScreen } from './screens/goals/GoalEditScreen';
import { PlanScreen } from './screens/plan/PlanScreen';
import { WeekDetailScreen } from './screens/plan/WeekDetailScreen';
import { MoreScreen } from './screens/more/MoreScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { ScreenFallback } from './ui/ScreenFallback';

// The only lazy chunk (ARCHITECTURE.md §1: splitting every 6kB screen costs more in
// waterfalls than it saves) — Progress pulls in three SVG chart components plus
// their geometry math, the heaviest screen in the app.
const ProgressScreen = lazy(() => import('./screens/progress/ProgressScreen').then((m) => ({ default: m.ProgressScreen })));

export const routes: RouteObject[] = [
  {
    element: <TabLayout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayScreen /> },
      { path: 'goals', element: <GoalsScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      {
        path: 'progress',
        element: (
          <Suspense fallback={<ScreenFallback />}>
            <ProgressScreen />
          </Suspense>
        ),
      },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
  {
    element: <FullLayout />,
    children: [
      { path: 'goals/new', element: <GoalFormScreen /> },
      { path: 'goals/:goalId', element: <GoalDetailScreen /> },
      { path: 'goals/:goalId/edit', element: <GoalEditScreen /> },
      { path: 'plan/:weekStart', element: <WeekDetailScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
