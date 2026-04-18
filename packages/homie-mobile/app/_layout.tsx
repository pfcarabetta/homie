import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root layout for the Homie consumer app.
 *
 * Wraps every route in:
 *  - SafeAreaProvider (so screens can avoid notches / home indicator)
 *  - StatusBar with auto light/dark
 *  - Stack navigator (default mode; swap to Tabs once we have multiple top-level surfaces)
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#F9F5F2' },
          headerTintColor: '#2D2926',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Homie' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
