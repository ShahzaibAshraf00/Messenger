import React from 'react';

interface ModernAvatarProps {
  seed: string;
  name?: string;
  photoUrl?: string;
  size?: number;
  className?: string;
}

const GRADIENTS = [
  'from-zinc-700 to-zinc-900 text-zinc-100',
  'from-blue-600 to-indigo-900 text-blue-100',
  'from-emerald-600 to-teal-900 text-emerald-100',
  'from-violet-600 to-purple-900 text-purple-100',
  'from-amber-600 to-orange-900 text-amber-100',
  'from-rose-600 to-pink-900 text-rose-100',
  'from-cyan-600 to-blue-900 text-cyan-100',
];

export const ModernAvatar: React.FC<ModernAvatarProps> = ({
  seed,
  name,
  photoUrl,
  size = 40,
  className = '',
}) => {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name || seed}
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover border border-zinc-700/50 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Generate initials
  const displayName = name || seed.split('@')[0] || '?';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  // Deterministic gradient selection
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const gradientClass = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  const fontSize = Math.max(11, Math.floor(size * 0.38));

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center font-medium select-none shrink-0 shadow-xs border border-white/10 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: `${fontSize}px`,
      }}
      title={name || seed}
    >
      {initials || '?'}
    </div>
  );
};

// Export as RetroAvatar alias as well for backwards compatibility if needed
export const RetroAvatar = ModernAvatar;
