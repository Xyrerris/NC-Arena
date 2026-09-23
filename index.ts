/**
 * The app's entry. It is expo-router's, plus one import.
 *
 * `backgroundSync` defines the periodic sync task, and a task has to be defined wherever the
 * bundle starts — not inside a route. When the OS wakes a closed app for it, the bundle runs
 * headless and nothing under `src/app` is ever evaluated (see the module for the rest).
 */
import 'expo-router/entry';

import './src/core/data/backgroundSync';
