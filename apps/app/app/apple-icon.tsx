import { ImageResponse } from "next/og";

/**
 * Home-screen icon. Full-bleed rather than a rounded tile — iOS applies its own
 * corner mask, and a radius underneath it shows as a pale seam.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BRAND_GREEN = "#2ee87f";
// The 32-unit LogoMark grid scaled by 180/32.
const MARK_FOREGROUND = "#052e16";
const BAR_HEIGHTS = [39, 68, 107];

const AppleIcon = () =>
  new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 8,
        paddingBottom: 34,
        background: BRAND_GREEN,
      }}
    >
      {BAR_HEIGHTS.map((height) => (
        <div
          key={height}
          style={{
            width: 28,
            height,
            borderRadius: 14,
            background: MARK_FOREGROUND,
          }}
        />
      ))}
    </div>,
    { ...size }
  );

export default AppleIcon;
