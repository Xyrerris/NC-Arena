/**
 * The mark for "this piece must carry a skill": a small accent diamond, drawn rather than typed.
 *
 * A glyph such as ◆ depends on the font having it and falls back to whatever the device picks, at
 * a size and weight nobody chose; a rotated square is the same shape everywhere. It is a fixed
 * box, so a row's names line up whether or not they carry the mark, and it hides from a screen
 * reader because the line it sits on already says "needs a skill" in words.
 */

import { StyleSheet, View } from 'react-native';

import { color, space } from '@/core/design-system';

export function SkillMark({ shown }: { shown: boolean }) {
  return (
    <View style={styles.box} importantForAccessibility="no-hide-descendants">
      {shown ? <View style={styles.diamond} testID="skill-mark" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide enough for the rotated square's corners; the same box with or without the mark.
  box: { width: space[12], alignItems: 'center', justifyContent: 'center' },
  diamond: {
    width: space[6],
    height: space[6],
    backgroundColor: color.accent,
    transform: [{ rotate: '45deg' }],
  },
});
