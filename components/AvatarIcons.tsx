'use client';

export const AVATAR_ICONS: Record<string, React.ReactNode> = {
  '#FF6B35': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="20" rx="7" ry="5" fill="#FF6B35" />
      <ellipse cx="16" cy="14" rx="5" ry="4" fill="#FF6B35" />
      <ellipse cx="9" cy="13" rx="2.5" ry="1.5" fill="#FF6B35" transform="rotate(-20 9 13)" />
      <ellipse cx="23" cy="13" rx="2.5" ry="1.5" fill="#FF6B35" transform="rotate(20 23 13)" />
      <circle cx="14" cy="13" r="1.2" fill="#1C1C38" />
      <circle cx="19" cy="13" r="1.2" fill="#1C1C38" />
      <ellipse cx="16" cy="16" rx="1.5" ry="0.8" fill="#FF3D81" />
      <path d="M10 20 Q16 26 22 20" stroke="#FF3D81" stroke-width="1.5" fill="none" stroke-linecap="round" />
    </svg>
  ),
  '#FF3D81': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="20" rx="6.5" ry="4.5" fill="#FF3D81" />
      <ellipse cx="16" cy="14" rx="4.5" ry="3.5" fill="#FF3D81" />
      <path d="M9 11 Q10 6 13 7 Q16 8 19 7 Q22 6 23 11" fill="#FF3D81" />
      <path d="M16 11 Q16 6 16 7" stroke="#FF6B35" stroke-width="1.5" fill="none" />
      <circle cx="14" cy="13" r="1.2" fill="#1C1C38" />
      <circle cx="19" cy="13" r="1.2" fill="#1C1C38" />
      <ellipse cx="16" cy="16" rx="1.5" ry="0.8" fill="#FFC53D" />
    </svg>
  ),
  '#8B5CF6': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="19" rx="7" ry="5" fill="#8B5CF6" />
      <ellipse cx="16" cy="13" rx="5" ry="4" fill="#8B5CF6" />
      <ellipse cx="16" cy="10" rx="3.5" ry="2" fill="#A855F7" />
      <ellipse cx="9" cy="12" rx="1.8" ry="1.2" fill="#8B5CF6" transform="rotate(-25 9 12)" />
      <ellipse cx="23" cy="12" rx="1.8" ry="1.2" fill="#8B5CF6" transform="rotate(25 23 12)" />
      <circle cx="14" cy="12" r="1.2" fill="#1C1C38" />
      <circle cx="19" cy="12" r="1.2" fill="#1C1C38" />
      <ellipse cx="16" cy="15" rx="1.5" ry="0.8" fill="#FFC53D" />
      <path d="M13 18 Q16 21 19 18" stroke="#FFC53D" stroke-width="1.5" fill="none" stroke-linecap="round" />
    </svg>
  ),
  '#34D399': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="20" rx="7" ry="5" fill="#34D399" />
      <ellipse cx="16" cy="14" rx="5.5" ry="4.5" fill="#34D399" />
      <ellipse cx="16" cy="12" rx="4" ry="3" fill="#10B981" />
      <circle cx="13" cy="12" r="2" fill="#1C1C38" />
      <circle cx="19" cy="12" r="2" fill="#1C1C38" />
      <circle cx="13" cy="11" r="0.7" fill="#FFF" />
      <circle cx="19" cy="11" r="0.7" fill="#FFF" />
      <ellipse cx="16" cy="17" rx="2.5" ry="1.5" fill="#10B981" />
      <path d="M11 18 Q16 20 21 18" stroke="#FFC53D" stroke-width="2" fill="none" stroke-linecap="round" />
      <circle cx="16" cy="19" r="0.5" fill="#FFC53D" />
    </svg>
  ),
  '#38BDF8': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <rect x="8" y="12" width="16" height="14" rx="4" fill="#38BDF8" />
      <rect x="10" y="14" width="12" height="8" rx="2" fill="#0EA5E9" />
      <circle cx="14" cy="18" r="2.5" fill="#1C1C38" />
      <circle cx="19" cy="18" r="2.5" fill="#1C1C38" />
      <circle cx="14" cy="17" r="0.8" fill="#FFF" />
      <circle cx="19" cy="17" r="0.8" fill="#FFF" />
      <rect x="15" y="22" width="2" height="4" rx="1" fill="#FFC53D" />
      <rect x="19" y="10" width="3" height="4" rx="1.5" fill="#FF6B35" />
      <rect x="10" y="10" width="3" height="4" rx="1.5" fill="#FF6B35" />
    </svg>
  ),
  '#FFC53D': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="19" rx="7.5" ry="5.5" fill="#FFC53D" />
      <ellipse cx="16" cy="13" rx="5" ry="4" fill="#FFC53D" />
      <path d="M10 11 Q12 6 16 7 Q20 6 22 11" fill="#FFC53D" />
      <path d="M16 11 Q16 6 16 7" stroke="#FF6B35" stroke-width="2" fill="none" />
      <circle cx="14" cy="12" r="1.5" fill="#1C1C38" />
      <circle cx="19" cy="12" r="1.5" fill="#1C1C38" />
      <ellipse cx="16" cy="15" rx="1.5" ry="0.8" fill="#FF6B35" />
      <path d="M13 17 Q16 20 19 17" stroke="#FF6B35" stroke-width="1.5" fill="none" stroke-linecap="round" />
      <path d="M16 18 L16 22" stroke="#FF6B35" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  ),
  '#F8FAFC': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="20" rx="7" ry="5.5" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1" />
      <ellipse cx="16" cy="14" rx="5" ry="4" fill="#F8FAFC" stroke="#94A3B8" stroke-width="1" />
      <ellipse cx="16" cy="11" rx="3.5" ry="2.5" fill="#E2E8F0" />
      <ellipse cx="9" cy="13" rx="2" ry="1.2" fill="#F8FAFC" transform="rotate(-20 9 13)" stroke="#94A3B8" stroke-width="0.5" />
      <ellipse cx="23" cy="13" rx="2" ry="1.2" fill="#F8FAFC" transform="rotate(20 23 13)" stroke="#94A3B8" stroke-width="0.5" />
      <circle cx="14" cy="12" r="1.3" fill="#475569" />
      <circle cx="19" cy="12" r="1.3" fill="#475569" />
      <circle cx="14" cy="11" r="0.5" fill="#FFF" opacity="0.6" />
      <circle cx="19" cy="11" r="0.5" fill="#FFF" opacity="0.6" />
      <ellipse cx="16" cy="16" rx="1.5" ry="0.8" fill="#64748B" />
      <path d="M11 18 Q16 20 21 18" stroke="#64748B" stroke-width="1.5" fill="none" stroke-linecap="round" />
    </svg>
  ),
  '#FB4D6D': (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="avatar-icon">
      <ellipse cx="16" cy="20" rx="7" ry="5" fill="#FB4D6D" />
      <ellipse cx="16" cy="14" rx="5" ry="4" fill="#FB4D6D" />
      <path d="M9 11 Q11 5 16 7 Q21 5 23 11" fill="#FB4D6D" />
      <path d="M16 11 Q16 5 16 7" stroke="#FFC53D" stroke-width="2" fill="none" />
      <circle cx="14" cy="12" r="1.3" fill="#1C1C38" />
      <circle cx="19" cy="12" r="1.3" fill="#1C1C38" />
      <ellipse cx="16" cy="15.5" rx="1.5" ry="0.8" fill="#FFC53D" />
      <path d="M13 17 Q16 20 19 17" stroke="#FFC53D" stroke-width="1.5" fill="none" stroke-linecap="round" />
      <ellipse cx="16" cy="19" rx="2.5" ry="1" fill="#FF6B35" opacity="0.5" />
    </svg>
  ),
};

export function AvatarIcon({ color, size = 32 }: { color: string; size?: number }) {
  const Icon = AVATAR_ICONS[color] || AVATAR_ICONS['#FF6B35'];
  return (
    <div style={{ width: size, height: size }} className="avatar-icon-wrapper">
      {Icon}
    </div>
  );
}

export const AVATAR_NAMES: Record<string, string> = {
  '#FF6B35': 'Cyber Fox',
  '#FF3D81': 'Astro Cat',
  '#8B5CF6': 'Glitch Alien',
  '#34D399': 'Pixel Frog',
  '#38BDF8': 'Neon Bot',
  '#FFC53D': 'Hyper Tiger',
  '#F8FAFC': 'Frost Ghost',
  '#FB4D6D': 'Blaze Wolf',
};