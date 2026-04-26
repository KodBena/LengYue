/**
 * src/main.ts
 * License: Public Domain (The Unlicense)
 */

import './jquery-bridge';
import 'jquery-ui-dist/jquery-ui';
import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { store } from './store';
import { serializeBoard, serializeActivePath } from './engine/sgf-writer';

// Expose the reactive store to the browser console for verification ONLY in DEV.
if (import.meta.env.DEV) {
  (window as any).store = store;
  (window as any).Writer = { serializeBoard, serializeActivePath };
}

createApp(App).mount('#app');
