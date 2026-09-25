import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from './app/providers/AppProviders';
import { ErrorBoundary } from './app/ErrorBoundary';
import { ThemeEffect } from './app/ThemeEffect';
import { routes } from './routes';

const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <ThemeEffect />
        <RouterProvider router={router} />
      </AppProviders>
    </ErrorBoundary>
  );
}
