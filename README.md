# Alhambra Voice Guide

An advanced, offline-first Progressive Web App (PWA) that serves as an interactive, multilingual voice guide for the Alhambra palace and fortress complex in Granada, Spain. This app features a full guided tour route with progress tracking.

## Features

*   **Guided Tour Route:** A predefined walking tour is drawn directly on the map, showing the suggested path through all 25 points of interest.
*   **Route Progress Tracking:** As you visit each POI, the corresponding segment of the route on the map turns green, providing clear visual feedback on your progress through the tour.
*   **Fully Interactive Map:** Displays a dynamic, zoomable map of the Alhambra grounds using Leaflet.js and OpenStreetMap.
*   **Real-time GPS Tracking:** Uses the browser's Geolocation API to track your position in real-time and display it on the map with a marker.
*   **Simulation Mode:** For users not physically at the Alhambra, a simulation mode allows for a virtual tour. In this mode, users can click on any Point of Interest (POI) on the map or in the side panel list to be taken to that location and hear the guide.
*   **Proximity-Based Audio Guide:** When in live GPS mode, approaching a POI automatically triggers a spoken description of that location using the Web Speech API.
*   **Dynamic Subtitle Overlay:** The spoken description is simultaneously displayed as text in a semi-transparent overlay on the map, with a typewriter effect for better engagement.
*   **Dynamic Multi-Language Support:** The application is fully localized.
    *   It dynamically loads language options from a configuration file.
    *   All UI text, POI names, and descriptions are loaded from language-specific data files (`poi-en.json`, `poi-es.json`, etc.).
    *   Currently supports English, Spanish, French, German, and Chinese.
*   **Collapsible UI:** All controls are housed in a sleek, collapsible side panel to maximize map visibility.
*   **Light & Dark Themes:** Includes a theme switcher to toggle between a light and dark user interface, with the user's preference saved locally.
*   **Offline First (PWA):** The application is a Progressive Web App and is fully functional without an internet connection after the first visit, thanks to a Service Worker that caches all necessary assets. It can be installed on a mobile device's home screen for a native-like experience.

## Author

This project was developed by **Alberto Arce** ([alarti](https://github.com/alarti)).

## How to Run

1.  Since this application uses features like Service Workers and Geolocation that require a secure context (HTTPS), you need to serve the files from a local web server.
2.  If you have Python 3, you can run `python -m http.server` from the project's root directory.
3.  Navigate to `http://localhost:8000` in your browser.

## Testing

*   **Live Mode:** Use your browser's developer tools (e.g., Chrome's Sensors tab) to simulate different GPS locations to trigger the proximity-based audio guides.
*   **Simulation Mode:** Activate the "Simulation Mode" toggle in the side panel. Click on any POI marker on the map or any item in the POI list to simulate a visit.
*   **Offline Mode:** Load the application once. Then, in your browser's developer tools, go to the Network tab and enable "Offline" mode. Refresh the page; the application should continue to work.
*   **PWA Installation:** On a supported browser (like Chrome on Android or Safari on iOS), you should see an "Add to Home Screen" prompt or button, allowing you to install the app.
