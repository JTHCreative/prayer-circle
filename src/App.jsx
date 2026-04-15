import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Feed from './pages/Feed.jsx';
import NewPrayer from './pages/NewPrayer.jsx';
import Friends from './pages/Friends.jsx';
import Circles from './pages/Circles.jsx';
import CircleDetail from './pages/CircleDetail.jsx';
import Settings from './pages/Settings.jsx';
import PrayerBook from './pages/PrayerBook.jsx';
import AcceptInvite from './pages/AcceptInvite.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center">Loading…</div>;

  const loggedInHome = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : '/';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={loggedInHome} replace /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to={loggedInHome} replace /> : <Signup />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Feed />} />
        <Route path="/new" element={<NewPrayer />} />
        <Route path="/book" element={<PrayerBook />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/circles" element={<Circles />} />
        <Route path="/circles/:circleId" element={<CircleDetail />} />
        <Route path="/invite/:code" element={<AcceptInvite />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
