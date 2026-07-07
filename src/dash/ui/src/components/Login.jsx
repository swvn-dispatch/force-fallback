import { useState } from 'react';
import { Center, Paper, PasswordInput, TextInput, Button, Title, Alert, Stack } from '@mantine/core';
import { login } from '../api.js';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="md" p="xl" radius="md" w={360} maw="100%">
        <Title order={2} mb="md" ta="center">
          Force Fallback
        </Title>
        <form onSubmit={handleSubmit}>
          <Stack>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              required
              autoFocus
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
            <Button type="submit" loading={loading} fullWidth mt="sm">
              Log In
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
