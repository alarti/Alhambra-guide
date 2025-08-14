/* Author: Alberto Arce, Arcasoft */
document.addEventListener('DOMContentLoaded', () => {
    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }

    // --- Elements ---
    const langSelector = document.getElementById('language-selector');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const guideText = document.getElementById('guide-text-overlay').querySelector('p'); // Select the paragraph tag
    const simulationModeToggle = document.getElementById('simulation-mode-toggle');
    const sidePanel = document.getElementById('side-panel');
    const panelToggleBtn = document.getElementById('panel-toggle-btn');

    // --- State and Config ---
    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters
    let currentLang = 'en'; // Default language
    let isSimulationMode = simulationModeToggle.checked;
    let map; // Leaflet map instance
    let userMarker; // Leaflet marker for user's position
    let geolocationId = null; // To store the ID of the geolocation watch
    let typewriterInterval = null; // To store the typewriter effect interval
    const poiMarkers = {}; // To store POI marker instances { poiId: marker }
    
    // Data will be loaded from assets/pois.json
    let pois = []; 
    let translations = {
        en: {
            title: "Alhambra Voice Guide", welcome: "Welcome to the Alhambra! Your tour will begin shortly.", play: "Play", pause: "Pause", stop: "Stop",
            simulationMode: "Simulation Mode",
            geolocationNotSupported: "Geolocation is not supported by this browser.", geolocationDenied: "User denied the request for Geolocation.",
            geolocationUnavailable: "Location information is unavailable.", geolocationTimeout: "The request to get user location timed out.",
            geolocationUnknownError: "An unknown error occurred.", yourPosition: "Your position: Latitude: {lat}, Longitude: {lon}",
            pois: {}
        },
        es: {
            title: "Audioguía de la Alhambra", welcome: "¡Bienvenido a la Alhambra! Su recorrido comenzará en breve.", play: "Reproducir", pause: "Pausar", stop: "Detener",
            simulationMode: "Modo Simulación",
            geolocationNotSupported: "La geolocalización no es compatible con este navegador.", geolocationDenied: "El usuario denegó la solicitud de geolocalización.",
            geolocationUnavailable: "La información de ubicación no está disponible.", geolocationTimeout: "La solicitud para obtener la ubicación del usuario ha caducado.",
            geolocationUnknownError: "Ocurrió un error desconocido.", yourPosition: "Tu posición: Latitud: {lat}, Longitud: {lon}",
            pois: {}
        },
        fr: {
            title: "Audioguide de l'Alhambra", welcome: "Bienvenue à l'Alhambra ! Votre visite commencera sous peu.", play: "Jouer", pause: "Pause", stop: "Arrêter",
            simulationMode: "Mode Simulation",
            geolocationNotSupported: "La géolocalisation n'est pas prise en charge par ce navigateur.", geolocationDenied: "L'utilisateur a refusé la demande de géolocalisation.",
            geolocationUnavailable: "Les informations de localisation ne sont pas disponibles.", geolocationTimeout: "La demande de localisation de l'utilisateur a expiré.",
            geolocationUnknownError: "Une erreur inconnue est survenue.", yourPosition: "Votre position : Latitude : {lat}, Longitude : {lon}",
            pois: {}
        }
    };

    // --- Functions ---

    function typewriterEffect(element, text, speed = 30) {
        if (typewriterInterval) {
            clearInterval(typewriterInterval);
        }
        let i = 0;
        element.textContent = ""; // Clear the specific element
        typewriterInterval = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(typewriterInterval);
                typewriterInterval = null;
            }
        }, speed);
    }

    function updateGuideText(text, useTypewriter = false) {
        // The guideText variable now points to the single <p> tag
        if (useTypewriter) {
            typewriterEffect(guideText, text);
        } else {
            if (typewriterInterval) {
                clearInterval(typewriterInterval);
                typewriterInterval = null;
            }
            guideText.textContent = text;
        }
        // Auto-scroll the parent container if text overflows
        if (guideText.parentElement.scrollHeight > guideText.parentElement.clientHeight) {
            guideText.parentElement.scrollTop = 0; // Scroll to top for new message
        }
    }

    function setLanguage(lang) {
        currentLang = lang;
        const langMap = { en: 'en-US', es: 'es-ES', fr: 'fr-FR' };
        utterance.lang = langMap[lang] || 'en-US';

        document.querySelectorAll('[data-key]').forEach(elem => {
            const key = elem.getAttribute('data-key');
            if (translations[lang] && translations[lang][key]) {
                elem.textContent = translations[lang][key];
            }
        });

        // Update POI popups on the map
        for (const poiId in poiMarkers) {
            const poiInfo = translations[lang].pois[poiId];
            if (poiInfo) {
                const marker = poiMarkers[poiId];
                marker.getPopup().setContent(poiInfo.name);
            }
        }
    }

    function renderPois() {
        pois.forEach(poi => {
            const poiInfo = translations[currentLang].pois[poi.id];
            const marker = L.marker([poi.lat, poi.lon]).addTo(map)
                .bindPopup(poiInfo.name);
            
            marker.on('click', () => {
                if (isSimulationMode) {
                    const lat = poi.lat;
                    const lon = poi.lon;
                    
                    if (!userMarker) {
                        createUserMarker(lat, lon);
                    } else {
                        userMarker.setLatLng([lat, lon]);
                    }
                    map.flyTo([lat, lon]);
                    checkProximity(lat, lon);
                }
            });

            poiMarkers[poi.id] = marker;
        });
    }

    function speak(text) {
        if (synth.speaking) {
            synth.cancel();
        }
        utterance.text = text;
        synth.speak(utterance);
    }

    function startGpsTracking() {
        if (geolocationId) { // Clear any existing watch
            navigator.geolocation.clearWatch(geolocationId);
        }
        if (navigator.geolocation) {
            geolocationId = navigator.geolocation.watchPosition(showPosition, showError, { enableHighAccuracy: true });
        } else {
            updateGuideText(translations[currentLang].geolocationNotSupported);
        }
    }

    function stopGpsTracking() {
        if (geolocationId) {
            navigator.geolocation.clearWatch(geolocationId);
            geolocationId = null;
        }
    }

    function getLocation() {
        if (!isSimulationMode) {
            startGpsTracking();
        }
    }

    function createUserMarker(lat, lon) {
        const userIcon = L.divIcon({
            html: '<div style="background-color: blue; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
            className: '', // No default class
            iconSize: [15, 15],
            iconAnchor: [9, 9]
        });
        userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
        if (isSimulationMode) {
            userMarker.setOpacity(0.5);
        }
    }

    function showPosition(position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        if (!userMarker) {
            createUserMarker(lat, lon);
        } else {
            userMarker.setLatLng([lat, lon]);
        }
        
        if (!synth.speaking) {
            const text = translations[currentLang].yourPosition
                .replace('{lat}', lat.toFixed(4))
                .replace('{lon}', lon.toFixed(4));
            updateGuideText(text);
        }
        checkProximity(lat, lon);
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function checkProximity(lat, lon) {
        let inRangeOfPoi = null;
        let closestPoi = null;
        let minDistance = Infinity;

        for (const poi of pois) {
            const distance = getDistance(lat, lon, poi.lat, poi.lon);
            if (distance < minDistance) {
                minDistance = distance;
                closestPoi = poi;
            }
        }

        if (minDistance < PROXIMITY_THRESHOLD) {
            inRangeOfPoi = closestPoi;
        }
        
        const newTriggerId = inRangeOfPoi ? inRangeOfPoi.id : null;

        if (lastTriggeredPoiId && lastTriggeredPoiId !== newTriggerId) {
            poiMarkers[lastTriggeredPoiId].closePopup();
        }

        if (newTriggerId && newTriggerId !== lastTriggeredPoiId) {
            poiMarkers[newTriggerId].openPopup();
            
            lastTriggeredPoiId = newTriggerId;
            const poiInfo = translations[currentLang].pois[newTriggerId];
            updateGuideText(poiInfo.description, true); // Use typewriter effect here
            speak(poiInfo.description);
        } else if (!newTriggerId && lastTriggeredPoiId) {
            lastTriggeredPoiId = null;
        }
    }

    function showError(error) {
        const errorKey = {
            [error.PERMISSION_DENIED]: "geolocationDenied",
            [error.POSITION_UNAVAILABLE]: "geolocationUnavailable",
            [error.TIMEOUT]: "geolocationTimeout"
        }[error.code] || "geolocationUnknownError";
        updateGuideText(translations[currentLang][errorKey]);
    }

    // --- Event Listeners and Init ---

    function handleModeChange() {
        isSimulationMode = simulationModeToggle.checked;
        if (isSimulationMode) {
            stopGpsTracking();
            if (userMarker) {
                userMarker.setOpacity(0.5);
            }
        } else {
            if (userMarker) {
                userMarker.setOpacity(1.0);
            }
            startGpsTracking();
        }
    }

    langSelector.addEventListener('change', (event) => {
        setLanguage(event.target.value);
    });

    simulationModeToggle.addEventListener('change', handleModeChange);

    panelToggleBtn.addEventListener('click', () => {
        sidePanel.classList.toggle('collapsed');
        if (sidePanel.classList.contains('collapsed')) {
            panelToggleBtn.textContent = '☰';
        } else {
            panelToggleBtn.textContent = '→';
        }
    });

    playBtn.addEventListener('click', () => {
        if (synth.paused) {
            synth.resume();
        } else if (lastTriggeredPoiId) {
            const poiInfo = translations[currentLang].pois[lastTriggeredPoiId];
            if (poiInfo) speak(poiInfo.description);
        }
    });

    pauseBtn.addEventListener('click', () => {
        if (synth.speaking) synth.pause();
    });

    stopBtn.addEventListener('click', () => {
        if (synth.speaking) synth.cancel();
        if (lastTriggeredPoiId) {
            poiMarkers[lastTriggeredPoiId].closePopup();
            lastTriggeredPoiId = null;
        }
    });

    async function init() {
        try {
            const response = await fetch('assets/pois.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const poiData = await response.json();

            pois = poiData.map(p => ({ id: p.id, lat: p.lat, lon: p.lon }));
            poiData.forEach(p => {
                translations.en.pois[p.id] = p.en;
                translations.es.pois[p.id] = p.es;
                translations.fr.pois[p.id] = p.fr;
            });

            map = L.map('map-container').setView([37.177, -3.588], 16);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            
            // Set initial UI text and render markers
            updateGuideText(translations[currentLang].welcome);
            setLanguage(currentLang);
            renderPois();
            getLocation();
            handleModeChange(); // Set initial mode state

        } catch (error) {
            console.error("Could not load POI data:", error);
            updateGuideText("Could not load tour data. Please try again later.");
        }
    }

    init();
});
