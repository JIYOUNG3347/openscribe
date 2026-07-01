import * as React from "react";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  /** Width/height in px (applied to both). Defaults to 64. */
  size?: number | string;
  /** Accessible label. If omitted, the icon is hidden from screen readers. */
  title?: string;
}

/**
 * OpenScribe logo mark — an audio waveform, echoing the app's signature
 * waveform player (sound → written notes). Driven by `currentColor`, so it
 * inherits the parent CSS `color` (e.g. text-accent / text-ink). Brand
 * accent: --accent (#00754A). Original artwork, MIT-licensed with the project.
 */
const Logo = React.forwardRef<SVGSVGElement, LogoProps>(
  ({ size = 64, title, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="9" width="2.6" height="6" rx="1.3" />
      <rect x="6.4" y="5" width="2.6" height="14" rx="1.3" />
      <rect x="10.8" y="2" width="2.6" height="20" rx="1.3" />
      <rect x="15.2" y="6" width="2.6" height="12" rx="1.3" />
      <rect x="19.6" y="9" width="2.6" height="6" rx="1.3" />
    </svg>
  ),
);

Logo.displayName = "Logo";

export default Logo;
