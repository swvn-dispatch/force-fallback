import { useState } from 'react';
import { Center, Stack, Paper, TextInput, PasswordInput, Button, Text, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import logoUrl from '/logo.png';
import { login } from '../api.js';

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100dvh" bg="dark.8">
      <Stack align="center" gap="lg" w={340} px="md">
        <img src={logoUrl} style={{ height: 40, width: 'auto' }} alt="Force Fallback" />
        <Text size="sm" c="dimmed" ta="center">
          Sign in with your Dispatcharr credentials to view live sessions and swap sources.
        </Text>
        <Paper withBorder p="xl" radius="md" w="100%">
          <form onSubmit={handleSubmit}>
            <Stack gap="sm">
              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" py="xs">
                  {error}
                </Alert>
              )}
              <TextInput
                label="Username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
              <Button type="submit" loading={loading} fullWidth mt="xs">
                Sign in
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Center>
  );
}
