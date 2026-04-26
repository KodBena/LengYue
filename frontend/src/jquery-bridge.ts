// src/jquery-bridge.ts
import $ from 'jquery';

// We force these onto the window object immediately
(window as any).$ = $;
(window as any).jQuery = $;

export default $;
