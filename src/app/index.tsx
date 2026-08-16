import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Roster route.
 *
 * Phase 0 scaffold only — this renders enough to prove routing, theming and typed-route
 * generation work. Phase 3 replaces the body with <RosterScreen /> from features/roster;
 * this file stays thin (ARCHITECTURE.md §4).
 */
export default function RosterRoute() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Arena</Text>
      <Text style={styles.note}>Phase 0 scaffold. Roster screen lands in Phase 3.</Text>
      <Link href="/player/scaffold-id" style={styles.link}>
        Open a player detail route
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { color: '#e8efec', fontSize: 32 },
  note: { color: 'rgba(232,239,236,0.5)', fontSize: 14 },
  link: { color: '#5fd6a2', fontSize: 15, marginTop: 8 },
});
