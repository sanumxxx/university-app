import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{
          title: 'Вход',
          headerShown: false
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: 'Регистрация',
          headerShown: false
        }}
      />
    </Stack>
  );
}