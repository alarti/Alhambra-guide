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
    const exportBtn = document.getElementById('export-btn');
    const welcomeModal = document.getElementById('welcome-modal');
    const guideCatalogList = document.getElementById('guide-catalog-list');
    const createNewGuideBtn = document.getElementById('create-new-guide-btn');

    // --- State and Config ---
    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters
    let currentLang = 'en';
    let isSimulationMode = simulationModeToggle.checked;
    let isEditMode = false; // Default to view mode
    let isAddingPoi = false;
    let map;
    let userMarker;
    let geolocationId = null;
    let typewriterInterval = null;
    const poiMarkers = {};
    let pois = [];
    let poiBaseData = [];
    let availableLanguages = {};
    const tourRoute = [
        "poi-22", "poi-9", "poi-7", "poi-8", "poi-1", "poi-24", "poi-15", "poi-14", "poi-13", "poi-3",
        "poi-25", "poi-16", "poi-2", "poi-6", "poi-17", "poi-5", "poi-20", "poi-21", "poi-10", "poi-12",
        "poi-23", "poi-4", "poi-18", "poi-19"
    ];
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
            // Assumes an 'add-poi-btn' exists, which we will add to index.html
            document.getElementById('add-poi-btn').textContent = 'Cancel Adding POI';
        } else {
            mapContainer.style.cursor = '';
            document.getElementById('add-poi-btn').textContent = 'Add New POI';
        }
    }

    function editPoi(poiId) {
        const poi = pois.find(p => p.id === poiId);
        if (!poi) return;
        const newName = prompt("Enter new name:", poi.name);
        if (newName) poi.name = newName;
        const newDescription = prompt("Enter new description:", poi.description);
        if (newDescription) poi.description = newDescription;
        renderPoiList();
        renderPois();
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
        toggleAddPoiMode();
    }

    async function saveGuide() {
        const guideData = {
            initialView: { lat: map.getCenter().lat, lon: map.getCenter().lng, zoom: map.getZoom() },
            poiBaseData: poiBaseData,
            pois: pois.map(p => ({ id: p.id, name: p.name, description: p.description })),
            tourRoute: tourRoute
        };
        const guideContent = JSON.stringify(guideData, null, 2);
        const gistPayload = {
            description: "My Voice Guide Data",
            public: true,
            files: { "guide.json": { content: guideContent } }
        };

        alert("Saving to Gist... you will be notified.");

        try {
            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gistPayload)
            });
            if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`);
            const gistData = await response.json();
            prompt("Success! Your guide is saved. Copy this URL:", gistData.html_url);
        } catch (error) {
            prompt(`Error saving guide. Please copy the data below and save it manually.`, guideContent);
        }
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
                nameSpan.dataset.poiId = poi.id;
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

    function setupEventListeners() {
        simulationModeToggle.addEventListener('change', handleModeChange);
        themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked ? 'light' : 'dark'));
        panelToggleBtn.addEventListener('click', () => {
            sidePanel.classList.toggle('collapsed');
            panelToggleBtn.textContent = sidePanel.classList.contains('collapsed') ? '☰' : '→';
        });
        poiList.addEventListener('click', (event) => {
            if (isSimulationMode && event.target.matches('span[data-poi-id]')) {
                simulateVisitToPoi(event.target.dataset.poiId);
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
        aboutBtn.addEventListener('click', () => aboutModal.classList.remove('hidden'));
        modalCloseBtn.addEventListener('click', () => aboutModal.classList.add('hidden'));
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
            // Clear breadcrumbs when entering simulation mode
            breadcrumbPath = [];
            if (breadcrumbLayer) breadcrumbLayer.remove();
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

    exportBtn.addEventListener('click', () => {
        downloadJson(poiBaseData, 'poi-base-updated.json');
    });

    function downloadJson(data, filename) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

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

    function setMode(mode) {
        isEditMode = mode === 'edit';
        const modeControls = document.getElementById('mode-controls');
        modeControls.innerHTML = ''; // Clear existing controls

        if (isEditMode) {
            const saveBtn = document.createElement('button');
            saveBtn.id = 'save-guide-btn';
            saveBtn.className = 'btn btn-primary';
            saveBtn.textContent = 'Save Guide';
            saveBtn.onclick = saveGuide;
            modeControls.appendChild(saveBtn);

            const addPoiBtn = document.createElement('button');
            addPoiBtn.id = 'add-poi-btn';
            addPoiBtn.className = 'btn btn-success';
            addPoiBtn.textContent = 'Add New POI';
            addPoiBtn.onclick = toggleAddPoiMode;
            modeControls.appendChild(addPoiBtn);

            const exitEditBtn = document.createElement('button');
            exitEditBtn.className = 'btn btn-secondary';
            exitEditBtn.textContent = 'Exit Edit Mode';
            exitEditBtn.onclick = () => setMode('view');
            modeControls.appendChild(exitEditBtn);

        } else {
            const enterEditBtn = document.createElement('button');
            enterEditBtn.className = 'btn btn-primary';
            enterEditBtn.textContent = 'Edit This Guide';
            enterEditBtn.onclick = () => setMode('edit');
            modeControls.appendChild(enterEditBtn);
        }

        // Re-render UI elements that depend on the mode
        renderPois();
        renderPoiList();
    }

    async function init() {
        try {
            setupEventListeners(); // Setup general listeners once

            const urlParams = new URLSearchParams(window.location.search);
            const gistId = urlParams.get('gist');

            if (gistId) {
                welcomeModal.classList.add('hidden');
                await initializeMapWithGuide(gistId);
            } else {
                await showWelcomeModal();
            }
        } catch (error) {
            console.error("Initialization failed:", error);
            if (welcomeModal) welcomeModal.classList.add('hidden');
            updateGuideText("Could not initialize the application. Please try again later.");
        }
    }

    async function showWelcomeModal() {
        const response = await fetch('assets/guides.json');
        const guides = await response.json();

        guideCatalogList.innerHTML = '';
        guides.forEach(guide => {
            const a = document.createElement('a');
            a.className = 'list-group-item list-group-item-action';
            a.href = guide.gistId === 'default' ? 'index.html' : `?gist=${guide.gistId}`;
            a.innerHTML = `<strong>${guide.name}</strong><br><small>${guide.description}</small>`;
            guideCatalogList.appendChild(a);
        });

        createNewGuideBtn.onclick = async () => {
            welcomeModal.classList.add('hidden');
            await initializeMapWithGuide(null, true); // true for blank editor
        };
    }

    async function initializeMapWithGuide(gistId, isBlankEditor = false) {
        map = L.map('map-container');
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        if (isBlankEditor) {
            // New guide, set default view and empty data
            map.setView([48.8584, 2.2945], 13); // Default to Paris
            availableLanguages = { "en": "English" };
            pois = [];
            poiBaseData = [];
            tourRoute = [];
        } else if (gistId) {
            await loadGuideFromGist(gistId);
        } else {
            await loadDefaultGuide();
        }

        populateLanguageSelector();
        const savedTheme = localStorage.getItem('alhambra-theme') || 'dark';
        applyTheme(savedTheme);
        // Set up event listeners and modes
        await loadLanguageData(currentLang);
        getLocation();
        updateGuideText("Welcome! Select a POI from the list or use your GPS in live mode.");
        setMode(isBlankEditor ? 'edit' : 'view');
    }

    async function loadDefaultGuide() {
        const [langResponse, basePoiResponse] = await Promise.all([
            fetch('assets/languages.json'),
            fetch('assets/poi-base.json')
        ]);
        if (!langResponse.ok || !basePoiResponse.ok) throw new Error('Could not load default guide data.');
        availableLanguages = await langResponse.json();
        poiBaseData = await basePoiResponse.json();
        map.setView([37.177, -3.588], 17);
    }

    async function loadGuideFromGist(gistId) {
        const response = await fetch(`https://api.github.com/gists/${gistId}`);
        if (!response.ok) throw new Error('Could not load guide from Gist.');
        const gistData = await response.json();
        const file = gistData.files['guide.json'];
        if (!file) throw new Error('Gist does not contain a guide.json file.');
        const guideData = JSON.parse(file.content);

        poiBaseData = guideData.poiBaseData;
        tourRoute = guideData.tourRoute;
        // For simplicity, we'll use the english 'pois' data and ignore other languages for now
        pois = guideData.pois.map(p => ({ ...poiBaseData.find(pb => pb.id === p.id), ...p }));
        availableLanguages = { "en": "English" }; // Gist guides are single-language for now

        const { lat, lon, zoom } = guideData.initialView;
        map.setView([lat, lon], zoom);
    }

    init();
});
