import { profileStore } from '../stores/profileStore';

// El div que contiene los botones de edición
const modeControls = document.getElementById('mode-controls');

// Ocultar los controles por defecto para evitar que se muestren brevemente al cargar
if (modeControls) {
    modeControls.style.display = 'none';
}

// Escuchar los cambios en el store del perfil
profileStore.subscribe(profile => {
    if (!modeControls) return;

    if (profile && (profile.role === 'editor' || profile.role === 'admin')) {
        // Si el usuario es editor o admin, mostrar los controles
        modeControls.style.display = 'block'; // o 'grid' si se usa d-grid
    } else {
        // Para cualquier otro caso (viewer, anon, etc.), ocultar los controles
        modeControls.style.display = 'none';
    }
});
