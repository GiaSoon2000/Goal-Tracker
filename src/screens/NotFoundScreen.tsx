import { Link } from 'react-router-dom';

export function NotFoundScreen() {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ marginBottom: 16 }}>Page not found.</p>
      <Link to="/today" style={{ color: 'var(--accent)', fontWeight: 600 }}>
        Back to Today
      </Link>
    </div>
  );
}
