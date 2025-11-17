import { initializeWebviewApp } from "../runtime";
import "../styles/tailwind.css";

declare global {
  interface Window {
    initializeWebviewApp: typeof initializeWebviewApp;
  }
}

window.initializeWebviewApp = initializeWebviewApp;
