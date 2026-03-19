export function HomieLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="14" fill="#E8632B" />
      <path d="M24 12L10 23H14V35H21V28H27V35H34V23H38L24 12Z" fill="white" />
      <circle cx="24" cy="22" r="3" fill="#E8632B" />
    </svg>
  );
}

export function HomieAvatar() {
  return (
    <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shrink-0 shadow-md shadow-orange-500/25">
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <path d="M24 8L8 22H13V36H21V28H27V36H35V22H40L24 8Z" fill="white" />
      </svg>
    </div>
  );
}
