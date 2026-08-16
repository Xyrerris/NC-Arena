import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Catch-all for unmatched routes.
 *
 * Present from Phase 0 because file-based routing makes bad URLs reachable via deep
 * links from outside the app. The *in-app* not-found case — a valid route shape with an
 * unknown player id — is a separate concern and a Phase 4 exit criterion.
 */
export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>That screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          Back to the roster
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { color: '#e8efec', fontSize: 20 },
  link: { color: '#5fd6a2', fontSize: 15 },
});
