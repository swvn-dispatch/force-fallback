import { useState } from 'react';
import Login from './components/Login.jsx';
import SessionsList from './components/SessionsList.jsx';
import { isAuthenticated, logout } from './api.js';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }

  return (
    <SessionsList
      onLoggedOut={() => {
        logout();
        setAuthed(false);
      }}
    />
  );
}
