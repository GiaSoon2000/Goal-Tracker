import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers/AppProviders';
import { ErrorBoundary } from './app/ErrorBoundary';
import { MaterializationEffect } from './app/MaterializationEffect';
import { ThemeEffect } from './app/ThemeEffect';
import { UpdateBanner } from './app/UpdateBanner';
import { routes } from './routes';

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <ThemeEffect />
        <MaterializationEffect />
        <UpdateBanner />
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  );
}
