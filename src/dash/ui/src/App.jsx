import { useState } from 'react';
import { LoginScreen } from '@swvn-dispatch/dispatch-ui-kit';
import SessionsList from './components/SessionsList.jsx';
import { isAuthenticated, login, logout } from './api.js';
import logoUrl from '/logo.png';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return (
      <LoginScreen
        logoUrl={logoUrl}
        appName="Force Fallback"
        description="Sign in with your Dispatcharr credentials to view live sessions and swap sources."
        onLogin={login}
        onLoggedIn={() => setAuthed(true)}
      />
    );
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
