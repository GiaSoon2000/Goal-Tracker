import { Navigate, type RouteObject } from 'react-router-dom';
import { TabLayout } from './app/TabLayout';
import { FullLayout } from './app/FullLayout';
import { TodayScreen } from './screens/today/TodayScreen';
import { GoalsScreen } from './screens/goals/GoalsScreen';
import { GoalDetailScreen } from './screens/goals/GoalDetailScreen';
import { GoalFormScreen } from './screens/goals/GoalFormScreen';
import { PlanScreen } from './screens/plan/PlanScreen';
import { WeekDetailScreen } from './screens/plan/WeekDetailScreen';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { MoreScreen } from './screens/more/MoreScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';

export const routes: RouteObject[] = [
  {
    element: <TabLayout />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayScreen /> },
      { path: 'goals', element: <GoalsScreen /> },
      { path: 'plan', element: <PlanScreen /> },
      { path: 'progress', element: <ProgressScreen /> },
      { path: 'more', element: <MoreScreen /> },
    ],
  },
  {
    element: <FullLayout />,
    children: [
      { path: 'goals/new', element: <GoalFormScreen /> },
      { path: 'goals/:goalId', element: <GoalDetailScreen /> },
      { path: 'plan/:weekStart', element: <WeekDetailScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];
