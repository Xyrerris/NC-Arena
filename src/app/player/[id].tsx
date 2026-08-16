import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Player detail route.
 *
 * Phase 0 scaffold only. Phase 4 replaces the body with <PlayerDetailScreen />.
 *
 * Note for Phase 4: `id` arrives as a plain string. This file is the one place that
 * brands it into a PlayerId (ARCHITECTURE.md §5), and it must do so only after
 * confirming the row exists — file-based routing makes `player/<unknown-id>` a
 * reachable URL, which is a Phase 4 exit criterion.
 */
export default function PlayerDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Player detail</Text>
      <Text style={styles.mono}>id: {id}</Text>
      <Text style={styles.note}>Phase 0 scaffold. Stats and Vs You land in Phase 4.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { color: '#e8efec', fontSize: 28 },
  mono: { color: 'rgba(232,239,236,0.5)', fontSize: 14, fontVariant: ['tabular-nums'] },
  note: { color: 'rgba(232,239,236,0.5)', fontSize: 14 },
});
