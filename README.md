# Alhambra Voice Guide

This is a simple, offline-first Progressive Web App (PWA) that serves as a voice guide for the Alhambra in Granada.

## Features

*   **Interactive Map:** Displays an SVG map of the Alhambra facilities.
*   **GPS Tracking:** Uses the browser's Geolocation API to track your position and display it on the map with a marker.
*   **Proximity-Based Voice Guide:** When you approach a Point of Interest (POI), the application automatically provides a spoken description using the Web Speech API.
*   **Multi-Language Support:** The user interface and voice guide are available in English, Spanish, and French.
*   **Offline First:** The application is fully functional without an internet connection, thanks to a Service Worker that caches all necessary assets.
*   **PWA:** The application is a Progressive Web App and can be installed on a mobile device's home screen for a native-like experience.

## Author

This project was developed by **Alberto Arce** of **Arcasoft**.

## How to Run

1.  Since this application uses features that require a secure context, you need to serve the files from a local web server.
2.  If you have Python 3, you can run `python -m http.server` from the project's root directory.
3.  Navigate to `http://localhost:8000` in your browser.

## Testing

*   **Geolocation:** Use your browser's developer tools (Sensors tab) to simulate different GPS locations and trigger the POI voice guides.
*   **Offline Mode:** Load the app once, then stop your local server and refresh the page. The app should continue to work.
*   **PWA Installation:** On a supported browser (like Chrome on Android or Safari on iOS), you should see an "Add to Home Screen" prompt or button.
