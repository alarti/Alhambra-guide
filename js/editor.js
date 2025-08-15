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
    const editModeToggle = document.getElementById('edit-mode-toggle');
    const sidePanel = document.getElementById('side-panel');
    const panelToggleBtn = document.getElementById('panel-toggle-btn');
    const poiList = document.getElementById('poi-list');
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const modalCloseBtn = aboutModal.querySelector('.modal-close-btn');
    const saveGuideBtn = document.getElementById('save-guide-btn');
    const addPoiBtn = document.getElementById('add-poi-btn');
    const saveModal = document.getElementById('save-modal');
    const saveModalCloseBtn = saveModal.querySelector('.modal-close-btn');
    const guideJsonOutput = document.getElementById('guide-json-output');

    // --- State and Config ---
    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters
    let currentLang = 'en';
    let isSimulationMode = simulationModeToggle.checked;
    let isEditMode = true; // Start in edit mode by default
    let isAddingPoi = false;
    let map;
    let userMarker;
    let geolocationId = null;
    let typewriterInterval = null;
    const poiMarkers = {};
    let pois = [];
    let poiBaseData = [];
    let availableLanguages = { "en": "English" }; // Simplified for editor
    let tourRoute = [];
    let routePolylines = [];
    let visitedPois = new Set();
    let breadcrumbPath = [];
    let breadcrumbLayer = null;

    const introPhrases = {
        en: ["You have arrived at", "You are now at", "This is"],
        es: ["Has llegado a", "Te encuentras en", "Esto es"],
        fr: ["Vous êtes arrivé à", "Vous êtes maintenant à", "Voici"],
        de: ["Sie sind angekommen bei", "Sie befinden sich jetzt bei", "Das ist"],
        zh: ["您已到达", "您现在在", "这里是"]
    };

    // --- Functions ---

    function toggleAddPoiMode() {
        isAddingPoi = !isAddingPoi;
        const mapContainer = document.getElementById('map-container');
        if (isAddingPoi) {
            mapContainer.style.cursor = 'crosshair';
            addPoiBtn.textContent = 'Cancel Adding POI';
            addPoiBtn.classList.remove('btn-success');
            addPoiBtn.classList.add('btn-danger');
        } else {
            mapContainer.style.cursor = '';
            addPoiBtn.textContent = 'Add New POI';
            addPoiBtn.classList.remove('btn-danger');
            addPoiBtn.classList.add('btn-success');
        }
    }

    function editPoi(poiId) {
        const poi = pois.find(p => p.id === poiId);
        if (!poi) return;

        const newName = prompt("Enter new name:", poi.name);
        if (newName) {
            poi.name = newName;
        }

        const newDescription = prompt("Enter new description:", poi.description);
        if (newDescription) {
            poi.description = newDescription;
        }

        renderPoiList();
        renderPois(); // To update the popup
    }

    function deletePoi(poiId) {
        if (!confirm("Are you sure you want to delete this POI?")) return;

        pois = pois.filter(p => p.id !== poiId);
        poiBaseData = poiBaseData.filter(p => p.id !== poiId);
        tourRoute = tourRoute.filter(id => id !== poiId);

        renderPois();
        renderPoiList();
        drawTourRoute();
    }

    function onMapClick(e) {
        if (!isAddingPoi) return;

        const { lat, lng } = e.latlng;
        const poiName = prompt("Enter POI Name:");
        if (!poiName) {
            toggleAddPoiMode();
            return;
        }

        const poiDescription = prompt("Enter POI Description:");
        if (!poiDescription) {
            toggleAddPoiMode();
            return;
        }

        const newPoiId = `poi-${Date.now()}`;

        const newPoiBase = { id: newPoiId, lat: lat, lon: lng };
        const newPoiLang = { id: newPoiId, name: poiName, description: poiDescription };

        poiBaseData.push(newPoiBase);
        pois.push({ ...newPoiBase, ...newPoiLang });
        tourRoute.push(newPoiId);

        renderPois();
        renderPoiList();
        drawTourRoute();

        // Exit add mode
        toggleAddPoiMode();
    }

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
        tourRoute.forEach(poiId => {
            const poi = pois.find(p => p.id === poiId);
            if (poi) {
                const li = document.createElement('li');
                li.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = poi.name;
                nameSpan.dataset.poiId = poi.id; // Keep this for simulation mode click
                li.appendChild(nameSpan);

                if (isEditMode) {
                    const btnGroup = document.createElement('div');

                    const editBtn = document.createElement('button');
                    editBtn.className = 'btn btn-sm btn-outline-secondary me-2';
                    editBtn.textContent = 'Edit';
                    editBtn.onclick = () => editPoi(poi.id);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-sm btn-outline-danger';
                    deleteBtn.textContent = 'Del';
                    deleteBtn.onclick = () => deletePoi(poi.id);

                    btnGroup.appendChild(editBtn);
                    btnGroup.appendChild(deleteBtn);
                    li.appendChild(btnGroup);
                }

                if (visitedPois.has(poiId)) {
                    li.classList.add('visited');
                }
                poiList.appendChild(li);
            }
        });
    }

    function drawTourRoute() {
        routePolylines.forEach(line => line.remove());
        routePolylines = [];
        for (let i = 0; i < tourRoute.length - 1; i++) {
            const startPoi = pois.find(p => p.id === tourRoute[i]);
            const endPoi = pois.find(p => p.id === tourRoute[i + 1]);
            if (startPoi && endPoi) {
                const isVisited = visitedPois.has(endPoi.id);
                const color = isVisited ? '#28a745' : '#3388ff';
                const line = L.polyline([[startPoi.lat, startPoi.lon], [endPoi.lat, endPoi.lon]], {
                    color: color,
                    weight: 3,
                    opacity: 0.7
                }).addTo(map);
                routePolylines.push(line);
            }
        }
    }

    function drawBreadcrumbs() {
        if (breadcrumbLayer) {
            breadcrumbLayer.remove();
        }
        const breadcrumbMarkers = breadcrumbPath.map(pos =>
            L.circleMarker(pos, {
                radius: 2,
                color: '#ff0000',
                fillColor: '#ff0000',
                fillOpacity: 0.8
            })
        );
        breadcrumbLayer = L.layerGroup(breadcrumbMarkers).addTo(map);
    }

    function renderPois() {
        for (const markerId in poiMarkers) {
            poiMarkers[markerId].remove();
            delete poiMarkers[markerId];
        }
        pois.forEach(poi => {
            const marker = L.marker([poi.lat, poi.lon], {
                draggable: isEditMode
            }).addTo(map).bindPopup(poi.name);

            marker.on('click', () => {
                if (isSimulationMode && !isEditMode) simulateVisitToPoi(poi.id);
            });

            marker.on('dragend', (event) => {
                const marker = event.target;
                const position = marker.getLatLng();
                const poiId = poi.id;

                const basePoi = poiBaseData.find(p => p.id === poiId);
                if (basePoi) {
                    basePoi.lat = position.lat;
                    basePoi.lon = position.lng;
                }

                const mergedPoi = pois.find(p => p.id === poiId);
                if (mergedPoi) {
                    mergedPoi.lat = position.lat;
                    mergedPoi.lon = position.lng;
                }

                drawTourRoute();
            });

            poiMarkers[poi.id] = marker;
        });
    }

    async function loadLanguageData(langCode) {
        try {
            updateGuideText(`Loading ${availableLanguages[langCode]} guide...`);
            const response = await fetch(`assets/poi-${langCode}.json`);
            if (!response.ok) throw new Error(`Could not load data for language: ${langCode}`);
            const langData = await response.json();

            pois = poiBaseData.map(basePoi => {
                const langPoi = langData.find(p => p.id === basePoi.id);
                return { ...basePoi, ...langPoi };
            });

            currentLang = langCode;
            const langMap = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', zh: 'zh-CN' };
            utterance.lang = langMap[langCode] || 'en-US';

            renderPois();
            renderPoiList();
            drawTourRoute();
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
        map.flyTo([lat, lon], 18);
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

        const lastBreadcrumb = breadcrumbPath[breadcrumbPath.length - 1];
        if (!lastBreadcrumb || getDistance(lat, lon, lastBreadcrumb[0], lastBreadcrumb[1]) > 10) { // Add breadcrumb every 10 meters
            breadcrumbPath.push([lat, lon]);
            drawBreadcrumbs();
        }

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
        if (!pois || pois.length === 0) return;

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

            visitedPois.add(newTriggerId);
            drawTourRoute();
            renderPoiList();

            const intros = introPhrases[currentLang] || introPhrases.en;
            const randomIntro = intros[Math.floor(Math.random() * intros.length)];
            const fullDescription = `${randomIntro} ${inRangeOfPoi.name}. ${inRangeOfPoi.description}`;

            updateGuideText(fullDescription, true);
            speak(fullDescription);
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

    function setupEventListeners() {
        addPoiBtn.addEventListener('click', toggleAddPoiMode);
        map.on('click', onMapClick);
        langSelector.addEventListener('change', (event) => {
            loadLanguageData(event.target.value);
        });
        simulationModeToggle.addEventListener('change', handleModeChange);
        themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked ? 'light' : 'dark'));
        editModeToggle.addEventListener('change', handleEditModeChange);
        panelToggleBtn.addEventListener('click', () => {
            sidePanel.classList.toggle('collapsed');
            panelToggleBtn.textContent = sidePanel.classList.contains('collapsed') ? '☰' : '→';
        });
        poiList.addEventListener('click', (event) => {
            // Check if the click is on the name span in simulation mode
            if (isSimulationMode && event.target.matches('span[data-poi-id]')) {
                simulateVisitToPoi(event.target.dataset.poiId);
            }
        });
        saveGuideBtn.addEventListener('click', saveGuide);
        saveModalCloseBtn.addEventListener('click', () => saveModal.classList.add('hidden'));
        saveModal.addEventListener('click', (event) => {
            if (event.target === saveModal) {
                saveModal.classList.add('hidden');
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
    }

    function handleModeChange() {
        isSimulationMode = simulationModeToggle.checked;
        if (isSimulationMode) {
            stopGpsTracking();
            if (userMarker) userMarker.setOpacity(0.5);
            // Clear breadcrumbs when entering simulation mode
            breadcrumbPath = [];
            if (breadcrumbLayer) breadcrumbLayer.remove();
        } else {
            if (userMarker) userMarker.setOpacity(1.0);
            startGpsTracking();
        }
    }

    function handleEditModeChange() {
        isEditMode = editModeToggle.checked;
        renderPois();
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
    editModeToggle.addEventListener('change', handleEditModeChange);

    panelToggleBtn.addEventListener('click', () => {
        sidePanel.classList.toggle('collapsed');
        panelToggleBtn.textContent = sidePanel.classList.contains('collapsed') ? '☰' : '→';
    });
    poiList.addEventListener('click', (event) => {
        // Check if the click is on the name span in simulation mode
        if (isSimulationMode && event.target.matches('span[data-poi-id]')) {
            simulateVisitToPoi(event.target.dataset.poiId);
        }
    });

   /* aboutBtn.addEventListener('click', () => aboutModal.classList.remove('hidden'));
    modalCloseBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));
    aboutModal.addEventListener('click', (event) => {
        if (event.target === aboutModal) {
            aboutModal.classList.add('hidden');
        }
    });

    exportBtn.addEventListener('click', () => {
        downloadJson(poiBaseData, 'poi-base-updated.json');
    });
*/
    function saveGuide() {
        const guideData = {
            initialView: {
                lat: map.getCenter().lat,
                lon: map.getCenter().lng,
                zoom: map.getZoom()
            },
            poiBaseData: poiBaseData,
            pois: pois.map(p => ({ id: p.id, name: p.name, description: p.description })), // Save only lang data
            tourRoute: tourRoute
        };

        const jsonStr = JSON.stringify(guideData, null, 2);
        guideJsonOutput.value = jsonStr;
        saveModal.classList.remove('hidden');
    }
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
            editModeToggle.checked = isEditMode;

            populateLanguageSelector();

            // Create map but don't set view yet
            map = L.map('map-container');
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            const searchControl = new GeoSearch.GeoSearchControl({
                provider: new GeoSearch.OpenStreetMapProvider(),
                style: 'bar',
            });
            map.addControl(searchControl);

            // Set initial view
            if (navigator.geolocation) {
                updateGuideText("Requesting your location...");
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        map.setView([position.coords.latitude, position.coords.longitude], 13);
                        updateGuideText("Location found! Welcome to the Guide Editor.");
                    },
                    () => {
                        map.setView([48.8584, 2.2945], 13); // Paris fallback
                        updateGuideText("Could not get location. Defaulting to Paris.");
                    }
                );
            } else {
                map.setView([48.8584, 2.2945], 13); // Paris fallback
                updateGuideText("Geolocation not supported. Defaulting to Paris.");
            }

            setupEventListeners();

            const savedTheme = localStorage.getItem('alhambra-theme') || 'dark';
            applyTheme(savedTheme);
            handleModeChange();
            handleEditModeChange();

            // No data loaded on init, start with a clean slate
            renderPois();
            renderPoiList();
            drawTourRoute();

            getLocation(); // This will still run for the blue dot marker

            // Initial message is now handled by geolocation callbacks

        } catch (error) {
            console.error("Initialization failed:", error);
            updateGuideText("Could not initialize the application. Please try again later.");
        }
    }

    init();
});
