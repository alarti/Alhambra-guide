/* Author: Alberto Arce, Arcasoft */
document.addEventListener('DOMContentLoaded', () => {
    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
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
    const guideText = document.getElementById('guide-text').querySelector('p');
    const mapContainer = document.getElementById('map-container');
    const map = document.getElementById('alhambra-map');
    const userMarker = document.createElement('div');
    userMarker.id = 'user-marker';
    mapContainer.appendChild(userMarker);

    // --- State and Config ---
    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters
    let currentLang = 'en'; // Default language

    // --- Points of Interest (static data) ---
    const pois = [
        { id: 'poi-1', lat: 37.1768, lon: -3.5885 },
        { id: 'poi-2', lat: 37.1775, lon: -3.5880 },
        { id: 'poi-3', lat: 37.1760, lon: -3.5895 },
        { id: 'poi-4', lat: 37.1785, lon: -3.5860 }
    ];

    // --- Translations ---
    const translations = {
        en: {
            title: "Alhambra Voice Guide", welcome: "Welcome to the Alhambra! Your tour will begin shortly.", play: "Play", pause: "Pause", stop: "Stop",
            geolocationNotSupported: "Geolocation is not supported by this browser.", geolocationDenied: "User denied the request for Geolocation.",
            geolocationUnavailable: "Location information is unavailable.", geolocationTimeout: "The request to get user location timed out.",
            geolocationUnknownError: "An unknown error occurred.", yourPosition: "Your position: Latitude: {lat}, Longitude: {lon}", nearPoi: "You are near {poiName}.",
            pois: {
                'poi-1': { name: 'Palace of Charles V', description: "The Palace of Charles V is a Renaissance building in Granada, southern Spain, located on the top of the hill of the Assabica, inside the Nasrid fortification of the Alhambra." },
                'poi-2': { name: 'Court of the Lions', description: "The Court of the Lions is the main courtyard of the Nasrid dynasty Palace of the Lions, in the heart of the Alhambra." },
                'poi-3': { name: 'Alcazaba', description: "The Alcazaba is the oldest part of the Alhambra, a fortress that was used as a military precinct." },
                'poi-4': { name: 'Generalife', description: "The Generalife was the summer palace and country estate of the Nasrid rulers of the Emirate of Granada in Al-Andalus." }
            }
        },
        es: {
            title: "Audioguía de la Alhambra", welcome: "¡Bienvenido a la Alhambra! Su recorrido comenzará en breve.", play: "Reproducir", pause: "Pausar", stop: "Detener",
            geolocationNotSupported: "La geolocalización no es compatible con este navegador.", geolocationDenied: "El usuario denegó la solicitud de geolocalización.",
            geolocationUnavailable: "La información de ubicación no está disponible.", geolocationTimeout: "La solicitud para obtener la ubicación del usuario ha caducado.",
            geolocationUnknownError: "Ocurrió un error desconocido.", yourPosition: "Tu posición: Latitud: {lat}, Longitud: {lon}", nearPoi: "Estás cerca de {poiName}.",
            pois: {
                'poi-1': { name: 'Palacio de Carlos V', description: "El Palacio de Carlos V es un edificio renacentista en Granada, sur de España, situado en la cima de la colina de la Assabica, dentro de la fortificación nazarí de la Alhambra." },
                'poi-2': { name: 'Patio de los Leones', description: "El Patio de los Leones es el patio principal del palacio de la dinastía nazarí de los Leones, en el corazón de la Alhambra." },
                'poi-3': { name: 'Alcazaba', description: "La Alcazaba es la parte más antigua de la Alhambra, una fortaleza que se utilizó como recinto militar." },
                'poi-4': { name: 'Generalife', description: "El Generalife fue el palacio de verano y finca rural de los gobernantes nazaríes del Emirato de Granada en Al-Ándalus." }
            }
        },
        fr: {
            title: "Audioguide de l'Alhambra", welcome: "Bienvenue à l'Alhambra ! Votre visite commencera sous peu.", play: "Jouer", pause: "Pause", stop: "Arrêter",
            geolocationNotSupported: "La géolocalisation n'est pas prise en charge par ce navigateur.", geolocationDenied: "L'utilisateur a refusé la demande de géolocalisation.",
            geolocationUnavailable: "Les informations de localisation ne sont pas disponibles.", geolocationTimeout: "La demande de localisation de l'utilisateur a expiré.",
            geolocationUnknownError: "Une erreur inconnue est survenue.", yourPosition: "Votre position : Latitude : {lat}, Longitude : {lon}", nearPoi: "Vous êtes près de {poiName}.",
            pois: {
                'poi-1': { name: 'Palais de Charles Quint', description: "Le palais de Charles Quint est un édifice de la Renaissance à Grenade, dans le sud de l'Espagne, situé au sommet de la colline de l'Assabica, à l'intérieur de la fortification nasride de l'Alhambra." },
                'poi-2': { name: 'Cour des Lions', description: "La Cour des Lions est la cour principale du palais de la dynastie nasride des Lions, au cœur de l'Alhambra." },
                'poi-3': { name: 'Alcazaba', description: "L'Alcazaba est la partie la plus ancienne de l'Alhambra, une forteresse qui servait d'enceinte militaire." },
                'poi-4': { name: 'Generalife', description: "Le Generalife était le palais d'été et le domaine de campagne des souverains nasrides de l'émirat de Grenade en Al-Andalus." }
            }
        }
    };

    // --- Functions ---

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

        // Update POI labels on the map
        document.querySelectorAll('.poi-marker').forEach(marker => {
            const poiId = marker.dataset.poiId;
            const poiLabel = marker.querySelector('.poi-label');
            if (poiId && poiLabel && translations[lang].pois[poiId]) {
                poiLabel.textContent = translations[lang].pois[poiId].name;
            }
        });
    }

    function renderPois() {
        pois.forEach(poi => {
            const { x, y } = mapGpsToSvgCoords(poi.lat, poi.lon);
            const poiMarker = document.createElement('div');
            poiMarker.className = 'poi-marker';
            poiMarker.style.left = `${x}px`;
            poiMarker.style.top = `${y}px`;
            poiMarker.dataset.poiId = poi.id;
            const poiLabel = document.createElement('span');
            poiLabel.className = 'poi-label';
            poiLabel.textContent = translations[currentLang].pois[poi.id].name;
            poiMarker.appendChild(poiLabel);
            mapContainer.appendChild(poiMarker);
        });
    }

    function speak(text) {
        if (synth.speaking) {
            synth.cancel();
        }
        utterance.text = text;
        synth.speak(utterance);
    }

    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(showPosition, showError, { enableHighAccuracy: true });
        } else {
            guideText.textContent = translations[currentLang].geolocationNotSupported;
        }
    }

    function showPosition(position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const { x, y } = mapGpsToSvgCoords(lat, lon);
        userMarker.style.left = `${x}px`;
        userMarker.style.top = `${y}px`;
        userMarker.style.display = 'block';

        if (!synth.speaking) {
            guideText.textContent = translations[currentLang].yourPosition
                .replace('{lat}', lat.toFixed(4))
                .replace('{lon}', lon.toFixed(4));
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
        for (const poi of pois) {
            const distance = getDistance(lat, lon, poi.lat, poi.lon);
            if (distance < PROXIMITY_THRESHOLD) {
                inRangeOfPoi = poi;
                break;
            }
        }

        document.querySelectorAll('.poi-marker.active').forEach(m => m.classList.remove('active'));

        if (inRangeOfPoi) {
            document.querySelector(`[data-poi-id="${inRangeOfPoi.id}"]`).classList.add('active');
            if (lastTriggeredPoiId !== inRangeOfPoi.id) {
                lastTriggeredPoiId = inRangeOfPoi.id;
                const poiInfo = translations[currentLang].pois[inRangeOfPoi.id];
                guideText.textContent = poiInfo.description;
                speak(poiInfo.description);
            }
        }
    }

    function mapGpsToSvgCoords(lat, lon) {
        const mapBounds = { latMin: 37.1750, lonMin: -3.5900, latMax: 37.1800, lonMax: -3.5840 };
        const mapRect = map.getBoundingClientRect();
        if (mapRect.width === 0) return { x: 0, y: 0 };
        const yPercent = (lat - mapBounds.latMin) / (mapBounds.latMax - mapBounds.latMin);
        const xPercent = (lon - mapBounds.lonMin) / (mapBounds.lonMax - mapBounds.lonMin);
        return { x: xPercent * mapRect.width, y: (1 - yPercent) * mapRect.height };
    }

    function showError(error) {
        const errorKey = {
            [error.PERMISSION_DENIED]: "geolocationDenied",
            [error.POSITION_UNAVAILABLE]: "geolocationUnavailable",
            [error.TIMEOUT]: "geolocationTimeout"
        }[error.code] || "geolocationUnknownError";
        guideText.textContent = translations[currentLang][errorKey];
    }

    // --- Event Listeners and Init ---

    langSelector.addEventListener('change', (event) => {
        setLanguage(event.target.value);
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
        lastTriggeredPoiId = null;
    });

    function init() {
        renderPois();
        setLanguage(currentLang); // Set initial language for UI
        getLocation();
    }

    map.addEventListener('load', init);
    if (map.complete) {
        init();
    }
});
