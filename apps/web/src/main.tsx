import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, Link } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cafeConfig } from '@kape/shared';
import { FoundationPage } from './pages/FoundationPage';
import './styles.css';

document.title = `${cafeConfig.name} · Cafe ordering demo`;
const queryClient = new QueryClient();
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<FoundationPage />} />
          <Route
            path="*"
            element={
              <main className="mx-auto max-w-xl p-8">
                <h1>Page not found</h1>
                <Link to="/">Back to the cafe</Link>
              </main>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
