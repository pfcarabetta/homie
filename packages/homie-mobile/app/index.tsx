import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Sanity check: importing from @homie/shared should resolve via workspace.
// If this errors at bundle time, metro.config.js isn't picking up workspaces.
import { cleanPrice, timeAgo, type AccountBooking } from '@homie/shared';

/**
 * Phase 1 placeholder home screen — proves the app boots, shared package
 * imports work, and styles render. Will be replaced with real auth/dashboard
 * routing in the next phase.
 */
export default function Index() {
  // Use the imported helpers so TS doesn't strip them as unused — also
  // confirms the shared types are accessible.
  const samplePrice = cleanPrice('between 200 and 300');
  const sampleTime = timeAgo(new Date(Date.now() - 1000 * 60 * 7).toISOString());
  const _typeProbe: Pick<AccountBooking, 'id' | 'status'> = { id: 'demo', status: 'confirmed' };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.brand}>homie</Text>
        <Text style={styles.tagline}>Mobile, coming soon</Text>

        <View style={styles.proofCard}>
          <Text style={styles.proofLabel}>Phase 1 sanity check</Text>
          <Text style={styles.proofRow}>cleanPrice: {samplePrice}</Text>
          <Text style={styles.proofRow}>timeAgo: {sampleTime}</Text>
          <Text style={styles.proofRow}>Booking type id: {_typeProbe.id}</Text>
        </View>

        <Text style={styles.footer}>
          Shared package imports working ✓
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F5F2',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    fontSize: 56,
    fontWeight: '700',
    color: '#E8632B',
    fontFamily: 'Georgia', // Fraunces lookalike — real font added in next phase
  },
  tagline: {
    fontSize: 14,
    color: '#6B6560',
    marginTop: 4,
    marginBottom: 32,
  },
  proofCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  proofLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9B9490',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  proofRow: {
    fontSize: 13,
    color: '#2D2926',
    marginVertical: 2,
    fontFamily: 'Menlo',
  },
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: '#1B9E77',
    fontWeight: '600',
  },
});
