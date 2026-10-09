'use client';

import { resolveAvatar, type AvatarSpecies } from '@/lib/avatars';

/**
 * Pixel icons keyed by SPECIES (not color). This is the only place avatar
 * artwork lives, and the keys are validated against `AvatarSpecies`, so an
 * avatar can never silently borrow another species' icon.
 */
export const AVATAR_ICONS: Record<AvatarSpecies, React.ReactNode> = {
  fox: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Cyber Fox: swept tail, pointed muzzle, tipped ears */}
      <path d="M22 21 Q29 19 27 12 Q25 16 21 16 Z" fill="#FF8A4C" />
      <ellipse cx="15" cy="21" rx="7" ry="5" fill="#FF6B35" />
      <ellipse cx="15" cy="14" rx="5" ry="4" fill="#FF6B35" />
      <path d="M9 12 L7.5 5 L12.5 9 Z" fill="#FF6B35" />
      <path d="M21 12 L22.5 5 L17.5 9 Z" fill="#FF6B35" />
      <path d="M9.6 11 L8.6 6.6 L11.4 9.2 Z" fill="#FF3D81" />
      <path d="M20.4 11 L21.4 6.6 L18.6 9.2 Z" fill="#FF3D81" />
      <circle cx="12.6" cy="13.4" r="1.2" fill="#1C1C38" />
      <circle cx="17.4" cy="13.4" r="1.2" fill="#1C1C38" />
      <circle cx="12.3" cy="13" r="0.4" fill="#FFF" />
      <circle cx="17.1" cy="13" r="0.4" fill="#FFF" />
      <path d="M15 15.4 L14 17.2 L16 17.2 Z" fill="#FF3D81" />
      <path d="M12 18 Q15 20.6 18 18" stroke="#FF3D81" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  cat: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Astro Cat: helmet ring, whiskers, triangular ears */}
      <path d="M22 21 Q29 20 27 13 Q24 17 20 17 Z" fill="#FF6FB0" />
      <ellipse cx="15" cy="20" rx="6.5" ry="4.5" fill="#FF3D81" />
      <ellipse cx="15" cy="14" rx="4.5" ry="3.5" fill="#FF3D81" />
      <path d="M9.5 12 L8.2 6 L12.8 9.4 Z" fill="#FF3D81" />
      <path d="M20.5 12 L21.8 6 L17.2 9.4 Z" fill="#FF3D81" />
      <path d="M13.6 16.6 L11 18.4 M16.4 16.6 L19 18.4" stroke="#FFC53D" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="13.4" cy="13.6" r="1.2" fill="#1C1C38" />
      <circle cx="16.6" cy="13.6" r="1.2" fill="#1C1C38" />
      <circle cx="13.1" cy="13.2" r="0.4" fill="#FFF" />
      <circle cx="16.3" cy="13.2" r="0.4" fill="#FFF" />
      <ellipse cx="15" cy="15.6" rx="1" ry="0.7" fill="#FFC53D" />
      <ellipse cx="15" cy="10" rx="1.4" ry="0.6" fill="#FFC53D" opacity="0.8" />
    </svg>
  ),
  alien: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Glitch Alien: antennae, oversized eyes, slit mouth */}
      <ellipse cx="15" cy="19" rx="7" ry="5" fill="#8B5CF6" />
      <ellipse cx="15" cy="13" rx="5.4" ry="4.4" fill="#8B5CF6" />
      <ellipse cx="15" cy="9.4" rx="3.4" ry="2" fill="#A855F7" />
      <path d="M13 7.4 L12 4.6 M17 7.4 L18 4.6" stroke="#A855F7" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="12" cy="4.6" r="1" fill="#FFC53D" />
      <circle cx="18" cy="4.6" r="1" fill="#FFC53D" />
      <ellipse cx="12.6" cy="12.6" rx="1.7" ry="2.1" fill="#1C1C38" />
      <ellipse cx="17.4" cy="12.6" rx="1.7" ry="2.1" fill="#1C1C38" />
      <circle cx="12.1" cy="12" r="0.5" fill="#FFF" />
      <circle cx="16.9" cy="12" r="0.5" fill="#FFF" />
      <path d="M12.4 17.4 Q15 19.2 17.6 17.4" stroke="#FFC53D" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  ),
  frog: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Pixel Frog: wide grin + bulging eyes on top of the head */}
      <ellipse cx="16" cy="21" rx="8" ry="6" fill="#34D399" />
      <ellipse cx="16" cy="15" rx="8" ry="6.5" fill="#34D399" />
      <ellipse cx="16" cy="23.5" rx="4.6" ry="3" fill="#6EE7B7" opacity="0.55" />
      <circle cx="10.6" cy="10.4" r="3.3" fill="#34D399" />
      <circle cx="21.4" cy="10.4" r="3.3" fill="#34D399" />
      <circle cx="10.6" cy="10.4" r="2.3" fill="#F8FAFC" />
      <circle cx="21.4" cy="10.4" r="2.3" fill="#F8FAFC" />
      <circle cx="10.6" cy="10.6" r="1.2" fill="#1C1C38" />
      <circle cx="21.4" cy="10.6" r="1.2" fill="#1C1C38" />
      <circle cx="10.2" cy="9.9" r="0.45" fill="#FFF" />
      <circle cx="21" cy="9.9" r="0.45" fill="#FFF" />
      <path d="M9 15.5 Q16 21.5 23 15.5" stroke="#10B981" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="13.8" cy="13" r="0.6" fill="#10B981" />
      <circle cx="18.2" cy="13" r="0.6" fill="#10B981" />
    </svg>
  ),
  robot: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Neon Bot: boxy head, glowing visor, antenna */}
      <rect x="8" y="12" width="16" height="14" rx="4" fill="#38BDF8" />
      <rect x="10" y="14" width="12" height="8" rx="2" fill="#0EA5E9" />
      <circle cx="14" cy="18" r="2.5" fill="#1C1C38" />
      <circle cx="19" cy="18" r="2.5" fill="#1C1C38" />
      <circle cx="14" cy="17" r="0.8" fill="#FFF" />
      <circle cx="19" cy="17" r="0.8" fill="#FFF" />
      <rect x="15" y="22" width="2" height="4" rx="1" fill="#FFC53D" />
      <rect x="19" y="10" width="3" height="4" rx="1.5" fill="#FF6B35" />
      <rect x="10" y="10" width="3" height="4" rx="1.5" fill="#FF6B35" />
      <circle cx="16" cy="8" r="1.2" fill="#FFC53D" />
    </svg>
  ),
  tiger: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Hyper Tiger: rounded ears, forehead stripes, muzzle */}
      <ellipse cx="15" cy="20" rx="7.5" ry="5.5" fill="#FFC53D" />
      <ellipse cx="15" cy="14" rx="5.6" ry="4.6" fill="#FFC53D" />
      <circle cx="9.6" cy="9.4" r="2.3" fill="#FFC53D" />
      <circle cx="20.4" cy="9.4" r="2.3" fill="#FFC53D" />
      <circle cx="9.6" cy="9.4" r="1.2" fill="#FF9F1C" />
      <circle cx="20.4" cy="9.4" r="1.2" fill="#FF9F1C" />
      <path d="M13.2 9.4 L13.2 11.2 M16.8 9.4 L16.8 11.2" stroke="#B45309" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="12.4" cy="13.6" rx="1.3" ry="1.1" fill="#1C1C38" />
      <ellipse cx="17.6" cy="13.6" rx="1.3" ry="1.1" fill="#1C1C38" />
      <ellipse cx="15" cy="16.2" rx="3.2" ry="2.4" fill="#FFF6E9" />
      <path d="M15 15.4 L14.2 16.8 L15.8 16.8 Z" fill="#FF6B35" />
      <path d="M13.6 18 Q15 19.4 16.4 18" stroke="#B45309" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M8.4 20.6 L10.8 20 M8.8 22.6 L11 21.8" stroke="#B45309" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
  ghost: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Frost Ghost: domed sheet with a wavy spectral hem — no ears or legs */}
      <path d="M6 27 V15 a10 10 0 0 1 20 0 V27 l-3.3 -2.7 -3.4 2.7 -3.3 -2.7 -3.4 2.7 -3.3 -2.7 Z" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1" strokeLinejoin="round" />
      <ellipse cx="12" cy="15.5" rx="2.2" ry="2.9" fill="#1C1C38" />
      <ellipse cx="20" cy="15.5" rx="2.2" ry="2.9" fill="#1C1C38" />
      <circle cx="11.3" cy="14.5" r="0.7" fill="#FFF" opacity="0.75" />
      <circle cx="19.3" cy="14.5" r="0.7" fill="#FFF" opacity="0.75" />
      <ellipse cx="16" cy="20.6" rx="1.5" ry="2.1" fill="#94A3B8" opacity="0.65" />
      <circle cx="8.4" cy="19.5" r="1.3" fill="#BAE6FD" opacity="0.5" />
      <circle cx="23.6" cy="19.5" r="1.3" fill="#BAE6FD" opacity="0.5" />
      <path d="M3.4 10.6 l1.4 1.4 M27.2 21.4 l1.4 1.4 M16 2.6 l0 1.8" stroke="#BAE6FD" strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
    </svg>
  ),
  wolf: (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon" aria-hidden="true">
      {/* Blaze Wolf: pointed ears, long muzzle, bared fangs */}
      <path d="M5 12 L7.4 3 L12 8.6 Z" fill="#FB4D6D" />
      <path d="M27 12 L24.6 3 L20 8.6 Z" fill="#FB4D6D" />
      <path d="M7.1 10.2 L8.5 5.4 L10.7 8.7 Z" fill="#FF6B35" />
      <path d="M24.9 10.2 L23.5 5.4 L21.3 8.7 Z" fill="#FF6B35" />
      <ellipse cx="16" cy="15" rx="9" ry="8" fill="#FB4D6D" />
      <ellipse cx="16" cy="20.5" rx="4.6" ry="4" fill="#FF8FA3" />
      <ellipse cx="12.5" cy="14" rx="1.7" ry="1.5" fill="#1C1C38" />
      <ellipse cx="19.5" cy="14" rx="1.7" ry="1.5" fill="#1C1C38" />
      <path d="M10 11.6 L13.4 13" stroke="#B91C3C" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M22 11.6 L18.6 13" stroke="#B91C3C" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M13.4 19 Q16 17.8 18.6 19 Q16 21 13.4 19 Z" fill="#1C1C38" />
      <path d="M14.2 22 L15 24 L15.8 22 Z" fill="#FFF6E9" />
      <path d="M16.2 22 L17 24 L17.8 22 Z" fill="#FFF6E9" />
    </svg>
  ),
};

/**
 * Renders the icon for an avatar. `color` accepts either the canonical color OR
 * the stable id (both resolve deterministically) so callers can pass whatever
 * `Player` field they have without worrying about which one it is.
 */
export function AvatarIcon({ color, size = 32 }: { color?: string | null; size?: number }) {
  const avatar = resolveAvatar(color);
  return (
    <div
      style={{ width: size, height: size }}
      className="avatar-icon-wrapper"
      data-avatar-icon
      data-avatar-id={avatar.id}
      data-avatar-species={avatar.species}
      aria-label={avatar.name}
      role="img"
    >
      {AVATAR_ICONS[avatar.species]}
    </div>
  );
}
