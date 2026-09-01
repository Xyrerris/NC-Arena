/**
 * Reanimated, for the jest projects only.
 *
 * The library's own `react-native-reanimated/mock` cannot be used: it imports the real
 * entry point for its enums, which reaches `react-native-worklets` and dies installing a
 * Nitro native module that does not exist in Node (`loadUnpackers` of undefined). A root
 * `__mocks__` module beside node_modules is picked up automatically, with no `jest.mock`
 * call in any test.
 *
 * What it is honest about: animated components render, and `useAnimatedStyle` returns the
 * style the worklet computes with every animation *already at its target value*. So a test
 * asserts where a bar ends up, never how it gets there. The motion itself is exactly the
 * kind of thing only pixels can confirm, which is the Maestro gate's job
 * (ARCHITECTURE.md §10) — not something a mock should pretend to verify.
 */

const React = require('react');
const { View, Text, ScrollView, Image } = require('react-native');

/** Animations resolve instantly: the value passed in is the value returned. */
const settle = (toValue) => toValue;

const createAnimatedComponent = (Component) => {
  const Animated = React.forwardRef((props, ref) =>
    React.createElement(Component, { ...props, ref }),
  );
  Animated.displayName = `Animated(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Animated;
};

const identityEasing = () => 0;
identityEasing.factory = () => identityEasing;

const Easing = {
  linear: identityEasing,
  ease: identityEasing,
  quad: identityEasing,
  cubic: identityEasing,
  bezier: () => ({ factory: () => identityEasing }),
  in: (fn) => fn,
  out: (fn) => fn,
  inOut: (fn) => fn,
};

// A mutable box that survives re-renders. `useState` rather than `useRef` so that reading
// it during render is not a lint violation — the box itself never changes identity.
const useSharedValue = (initial) => {
  const [box] = React.useState(() => ({ value: initial }));
  return box;
};

const useAnimatedStyle = (factory) => factory();

const Animated = {
  View: createAnimatedComponent(View),
  Text: createAnimatedComponent(Text),
  ScrollView: createAnimatedComponent(ScrollView),
  Image: createAnimatedComponent(Image),
  createAnimatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  createAnimatedComponent,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  useDerivedValue: (factory) => ({ value: factory() }),
  withTiming: settle,
  withSpring: settle,
  withDelay: (_delay, animation) => animation,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  clamp: (value, low, high) => Math.min(Math.max(value, low), high),

  // Reanimated's half of react-native-gesture-handler. `GestureDetector` reaches into
  // this module directly (`handlers/gestures/reanimatedWrapper`) and refuses to mount
  // without these two, so a row that merely *has* a pan gesture cannot render in jest
  // unless the mock admits they exist. Neither does anything: no gesture is dispatched in
  // a Node renderer, and the accessibility actions beside every swipe are what the tests
  // drive instead (ADR-0027).
  useEvent: () => () => {},
  setGestureState: () => {},
};
