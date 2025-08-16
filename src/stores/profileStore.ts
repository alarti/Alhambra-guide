import { atom } from 'nanostores';

export type Profile = {
  id: string;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
};

// El store del perfil, inicializado a null (sin usuario)
export const profileStore = atom<Profile | null>(null);
