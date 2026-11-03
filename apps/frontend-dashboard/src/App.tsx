import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/loading';
import { Navigate } from 'react-router-dom';

const Upload = lazy(() => import('./pages/Upload').then((m) => ({ default: m.Upload })));
const Resumes = lazy(() => import('./pages/Resumes').then((m) => ({ default: m.Resumes })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })));

function App() {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Analytics />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/resumes" element={<Resumes />} />
            <Route path="/analytics" element={<Navigate to="/" replace />} />
            <Route path="/jobs" element={<Jobs />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  );
}

export default App;
