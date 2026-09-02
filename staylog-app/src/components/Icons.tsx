import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconDashboard(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function IconBed(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M3 19V6" />
      <path d="M3 13h18v6" />
      <path d="M3 13V9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" />
      <path d="M13 11h6a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconAward(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="5.5" />
      <path d="M8.5 12.8 7 21l5-2.5L17 21l-1.5-8.2" />
    </svg>
  );
}

export function IconMap(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 1 1 13 0c0 5.3-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function IconChart(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V20a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 18.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 14a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.46Z" />
    </svg>
  );
}

export function IconSun(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </svg>
  );
}

export function IconMoon(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 20h16" />
      <path d="M14.5 4.5 18 8 8 18H4.5v-3.5Z" />
    </svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.4-.8.9-.8h4.2c.5 0 .9.4.9.8V7" />
      <path d="M6.5 7 7.3 20a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7" />
    </svg>
  );
}

export function IconX(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.6-4.6" />
    </svg>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v13" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconUpload(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 20V7" />
      <path d="M7 12l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconSparkle(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3v4M12 17v4M4.5 12h4M15.5 12h4M6.5 6.5l2.4 2.4M15.1 15.1l2.4 2.4M17.5 6.5l-2.4 2.4M8.9 15.1l-2.4 2.4" />
    </svg>
  );
}

export function IconRoute(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M15.5 5H10a3.5 3.5 0 0 0 0 7h4a3.5 3.5 0 0 1 0 7H8.5" />
    </svg>
  );
}

export function IconCopy(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1.5" />
    </svg>
  );
}

export function IconClipboard(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconChip(p: IconProps) {
  return (
    <svg width={34} height={25} viewBox="0 0 34 25" fill="none" {...p}>
      <rect width="34" height="25" rx="4" fill="#dfbe6f" />
      <rect x="0.5" y="0.5" width="33" height="24" rx="3.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
      <path
        d="M0 8.5h11v8H0M34 8.5H23v8h11M11 8.5V0M23 8.5V0M11 16.5V25M23 16.5V25M11 8.5h12v8H11z"
        stroke="rgba(90,65,15,0.45)"
        strokeWidth="0.9"
      />
      <rect x="11.5" y="9" width="11" height="7" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.7" />
    </svg>
  );
}

export function IconContactless(p: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M8.5 7.5a6.5 6.5 0 0 1 0 9" />
      <path d="M12 5a10 10 0 0 1 0 14" />
      <path d="M15.5 2.5a13.5 13.5 0 0 1 0 19" />
    </svg>
  );
}

export function IconNfc(p: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M8.5 7.5a6.5 6.5 0 0 1 0 9" />
      <path d="M12 5a10 10 0 0 1 0 14" />
      <path d="M15.5 2.5a13.5 13.5 0 0 1 0 19" />
    </svg>
  );
}

export function IconTicket(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v3Z" />
      <path d="M13 4v16" strokeDasharray="2 2" />
    </svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <svg {...base} {...p}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

