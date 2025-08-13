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

    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const guideText = document.getElementById('guide-text');
    const mapContainer = document.getElementById('map-container');
    const map = document.getElementById('alhambra-map');

    const userMarker = document.createElement('div');
    userMarker.id = 'user-marker';
    mapContainer.appendChild(userMarker);

    const synth = window.speechSynthesis;
    let utterance = new SpeechSynthesisUtterance();
    let lastTriggeredPoiId = null;
    const PROXIMITY_THRESHOLD = 20; // meters

    // --- Points of Interest ---
    const pois = [
        {
            id: 'poi-1',
            name: 'Palacio de Carlos V',
            lat: 37.1768,
            lon: -3.5885,
            description: "The Palace of Charles V is a Renaissance building in Granada, southern Spain, located on the top of the hill of the Assabica, inside the Nasrid fortification of the Alhambra."
        },
        {
            id: 'poi-2',
            name: 'Patio de los Leones',
            lat: 37.1775,
            lon: -3.5880,
            description: "The Court of the Lions is the main courtyard of the Nasrid dynasty Palace of the Lions, in the heart of the Alhambra."
        },
        {
            id: 'poi-3',
            name: 'Alcazaba',
            lat: 37.1760,
            lon: -3.5895,
            description: "The Alcazaba is the oldest part of the Alhambra, a fortress that was used as a military precinct."
        },
        {
            id: 'poi-4',
            name: 'Generalife',
            lat: 37.1785,
            lon: -3.5860,
            description: "The Generalife was the summer palace and country estate of the Nasrid rulers of the Emirate of Granada in Al-Andalus."
        }
    ];

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
            poiLabel.textContent = poi.name;
            poiMarker.appendChild(poiLabel);

            mapContainer.appendChild(poiMarker);
        });
    }

    // --- Voice Guide ---
    function speak(text) {
        if (synth.speaking) {
            synth.cancel(); // Stop any current speech before starting a new one
        }
        utterance.text = text;
        utterance.onend = () => {
            // Reset last triggered POI when speech finishes, so it can be re-triggered if user stays
            // lastTriggeredPoiId = null;
        };
        synth.speak(utterance);
    }

    playBtn.addEventListener('click', () => {
        if (synth.paused) {
            synth.resume();
        } else if (lastTriggeredPoiId) {
            const poi = pois.find(p => p.id === lastTriggeredPoiId);
            if (poi) speak(poi.description);
        }
    });

    pauseBtn.addEventListener('click', () => {
        if (synth.speaking) {
            synth.pause();
        }
    });

    stopBtn.addEventListener('click', () => {
        if (synth.speaking) {
            synth.cancel();
        }
        lastTriggeredPoiId = null; // Allow re-triggering
    });

    // --- Geolocation ---
    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(showPosition, showError, {
                enableHighAccuracy: true
            });
        } else {
            guideText.innerHTML = "Geolocation is not supported by this browser.";
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
            guideText.innerHTML = `Your position: Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}`;
        }

        checkProximity(lat, lon);
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metres
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // in metres
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

        // De-highlight all markers first
        document.querySelectorAll('.poi-marker.active').forEach(m => m.classList.remove('active'));

        if (inRangeOfPoi) {
             document.querySelector(`[data-poi-id="${inRangeOfPoi.id}"]`).classList.add('active');
            if (lastTriggeredPoiId !== inRangeOfPoi.id) {
                lastTriggeredPoiId = inRangeOfPoi.id;
                guideText.innerHTML = `You are near ${inRangeOfPoi.name}.`;
                speak(inRangeOfPoi.description);
            }
        } else {
            // If user is not in range of any POI and speech is not happening, maybe cancel it.
            // if (lastTriggeredPoiId && !synth.speaking) {
            //     lastTriggeredPoiId = null;
            // }
        }
    }

    function mapGpsToSvgCoords(lat, lon) {
        const mapBounds = {
            latMin: 37.1750, lonMin: -3.5900,
            latMax: 37.1800, lonMax: -3.5840
        };

        const mapRect = map.getBoundingClientRect();
        if (mapRect.width === 0) return { x: 0, y: 0 };

        const yPercent = (lat - mapBounds.latMin) / (mapBounds.latMax - mapBounds.latMin);
        const xPercent = (lon - mapBounds.lonMin) / (mapBounds.lonMax - mapBounds.lonMin);

        const x = xPercent * mapRect.width;
        const y = (1 - yPercent) * mapRect.height;

        return { x, y };
    }

    function showError(error) {
        switch(error.code) {
            case error.PERMISSION_DENIED:
                guideText.innerHTML = "User denied the request for Geolocation."
                break;
            case error.POSITION_UNAVAILABLE:
                guideText.innerHTML = "Location information is unavailable."
                break;
            case error.TIMEOUT:
                guideText.innerHTML = "The request to get user location timed out."
                break;
            case error.UNKNOWN_ERROR:
                guideText.innerHTML = "An unknown error occurred."
                break;
        }
    }

    map.addEventListener('load', () => {
        renderPois();
        getLocation();
    });

    if (map.complete) {
        renderPois();
        getLocation();
    }
});
