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
    const guideText = document.getElementById('guide-text-overlay').querySelector('p');
    const simulationModeToggle = document.getElementById('simulation-mode-toggle');
    const themeToggle = document.getElementById('theme-toggle');
    const sidePanel = document.getElementById('side-panel');
    const panelToggleBtn = document.getElementById('panel-toggle-btn');
    const poiList = document.getElementById('poi-list');
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const modalCloseBtn = aboutModal.querySelector('.modal-close-btn');


    // --- State and Config ---
    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters
    let currentLang = 'en';
    let isSimulationMode = simulationModeToggle.checked;
    let map;
    let userMarker;
    let geolocationId = null;
    let typewriterInterval = null;
    const poiMarkers = {};
    let pois = [];
    let availableLanguages = {};

    // --- Functions ---

    function typewriterEffect(element, text, speed = 30) {
        if (typewriterInterval) clearInterval(typewriterInterval);
        let i = 0;
        element.textContent = "";
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
        if (useTypewriter) {
            typewriterEffect(guideText, text);
        } else {
            if (typewriterInterval) clearInterval(typewriterInterval);
            guideText.textContent = text;
        }
        if (guideText.parentElement.scrollHeight > guideText.parentElement.clientHeight) {
            guideText.parentElement.scrollTop = 0;
        }
    }

    function populateLanguageSelector() {
        langSelector.innerHTML = '';
        for (const [code, name] of Object.entries(availableLanguages)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = name;
            if (code === currentLang) option.selected = true;
            langSelector.appendChild(option);
        }
    }

    function renderPoiList() {
        poiList.innerHTML = '';
        pois.forEach(poi => {
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-action';
            li.textContent = poi.name;
            li.dataset.poiId = poi.id;
            poiList.appendChild(li);
        });
    }

    function renderPois() {
        for (const markerId in poiMarkers) {
            poiMarkers[markerId].remove();
            delete poiMarkers[markerId];
        }
        pois.forEach(poi => {
            const marker = L.marker([poi.lat, poi.lon]).addTo(map)
                .bindPopup(poi.name);
            marker.on('click', () => {
                if (isSimulationMode) simulateVisitToPoi(poi.id);
            });
            poiMarkers[poi.id] = marker;
        });
    }

    async function loadLanguageData(langCode) {
        try {
            const response = await fetch(`assets/poi-${langCode}.json`);
            if (!response.ok) throw new Error(`Could not load data for language: ${langCode}`);
            pois = await response.json();

            currentLang = langCode;
            const langMap = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN' };
            utterance.lang = langMap[langCode] || 'en-US';

            renderPois();
            renderPoiList();
            updateGuideText(`Loaded ${availableLanguages[langCode]} guide.`);
        } catch (error) {
            console.error("Error loading language data:", error);
            updateGuideText(`Failed to load guide for ${availableLanguages[langCode]}.`);
        }
    }

    function simulateVisitToPoi(poiId) {
        const poi = pois.find(p => p.id === poiId);
        if (!poi) return;
        const { lat, lon } = poi;
        if (!userMarker) createUserMarker(lat, lon);
        else userMarker.setLatLng([lat, lon]);
        map.flyTo([lat, lon]);
        checkProximity(lat, lon);
    }

    function speak(text) {
        if (synth.speaking) synth.cancel();
        utterance.text = text;
        synth.speak(utterance);
    }

    function startGpsTracking() {
        if (geolocationId) navigator.geolocation.clearWatch(geolocationId);
        if (navigator.geolocation) {
            geolocationId = navigator.geolocation.watchPosition(showPosition, showError, { enableHighAccuracy: true });
        } else {
            updateGuideText("Geolocation is not supported by this browser.");
        }
    }

    function stopGpsTracking() {
        if (geolocationId) {
            navigator.geolocation.clearWatch(geolocationId);
            geolocationId = null;
        }
    }

    function getLocation() {
        if (!isSimulationMode) startGpsTracking();
    }

    function createUserMarker(lat, lon) {
        const userIcon = L.divIcon({
            html: '<div style="background-color: blue; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
            className: '',
            iconSize: [15, 15],
            iconAnchor: [9, 9]
        });
        userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map);
        if (isSimulationMode) userMarker.setOpacity(0.5);
    }

    function showPosition(position) {
        const { latitude: lat, longitude: lon } = position.coords;
        if (!userMarker) createUserMarker(lat, lon);
        else userMarker.setLatLng([lat, lon]);
        if (!synth.speaking) {
            updateGuideText(`Your position: Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`);
        }
        checkProximity(lat, lon);
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180; const Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function checkProximity(lat, lon) {
        let closestPoi = pois.reduce((closest, poi) => {
            const distance = getDistance(lat, lon, poi.lat, poi.lon);
            if (distance < closest.distance) return { ...poi, distance };
            return closest;
        }, { distance: Infinity });

        const inRangeOfPoi = closestPoi.distance < PROXIMITY_THRESHOLD ? closestPoi : null;
        const newTriggerId = inRangeOfPoi ? inRangeOfPoi.id : null;

        if (lastTriggeredPoiId && lastTriggeredPoiId !== newTriggerId) {
            poiMarkers[lastTriggeredPoiId].closePopup();
        }
        if (newTriggerId && newTriggerId !== lastTriggeredPoiId) {
            poiMarkers[newTriggerId].openPopup();
            lastTriggeredPoiId = newTriggerId;
            updateGuideText(inRangeOfPoi.description, true);
            speak(inRangeOfPoi.description);
        } else if (!newTriggerId && lastTriggeredPoiId) {
            lastTriggeredPoiId = null;
        }
    }

    function showError(error) {
        const errorMessages = {
            [error.PERMISSION_DENIED]: "User denied the request for Geolocation.",
            [error.POSITION_UNAVAILABLE]: "Location information is unavailable.",
            [error.TIMEOUT]: "The request to get user location timed out."
        };
        updateGuideText(errorMessages[error.code] || "An unknown error occurred.");
    }

    // --- Event Listeners and Init ---

    function handleModeChange() {
        isSimulationMode = simulationModeToggle.checked;
        if (isSimulationMode) {
            stopGpsTracking();
            if (userMarker) userMarker.setOpacity(0.5);
        } else {
            if (userMarker) userMarker.setOpacity(1.0);
            startGpsTracking();
        }
    }

    function applyTheme(theme) {
        document.body.dataset.theme = theme;
        localStorage.setItem('alhambra-theme', theme);
        themeToggle.checked = theme === 'light';
    }

    langSelector.addEventListener('change', (event) => {
        loadLanguageData(event.target.value);
    });

    simulationModeToggle.addEventListener('change', handleModeChange);
    themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked ? 'light' : 'dark'));
    panelToggleBtn.addEventListener('click', () => {
        sidePanel.classList.toggle('collapsed');
        panelToggleBtn.textContent = sidePanel.classList.contains('collapsed') ? '☰' : '→';
    });
    poiList.addEventListener('click', (event) => {
        if (isSimulationMode && event.target.matches('li.list-group-item')) {
            simulateVisitToPoi(event.target.dataset.poiId);
        }
    });

    aboutBtn.addEventListener('click', () => aboutModal.classList.remove('hidden'));
    modalCloseBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));
    aboutModal.addEventListener('click', (event) => {
        if (event.target === aboutModal) {
            aboutModal.classList.add('hidden');
        }
    });

    playBtn.addEventListener('click', () => {
        if (synth.paused) synth.resume();
        else if (lastTriggeredPoiId) {
            const poi = pois.find(p => p.id === lastTriggeredPoiId);
            if (poi) speak(poi.description);
        }
    });
    pauseBtn.addEventListener('click', () => { if (synth.speaking) synth.pause(); });
    stopBtn.addEventListener('click', () => {
        if (synth.speaking) synth.cancel();
        if (lastTriggeredPoiId) {
            poiMarkers[lastTriggeredPoiId].closePopup();
            lastTriggeredPoiId = null;
        }
    });

    async function init() {
        try {
            const langResponse = await fetch('assets/languages.json');
            if (!langResponse.ok) throw new Error('Could not load language configuration.');
            availableLanguages = await langResponse.json();

            populateLanguageSelector();

            map = L.map('map-container').setView([37.177, -3.588], 16);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            const savedTheme = localStorage.getItem('alhambra-theme') || 'dark';
            applyTheme(savedTheme);
            handleModeChange();

            await loadLanguageData(currentLang);

            getLocation();

        } catch (error) {
            console.error("Initialization failed:", error);
            updateGuideText("Could not initialize the application. Please try again later.");
        }
    }

    init();
});
