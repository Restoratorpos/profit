import { ImageResponse } from "next/og";

/** Link preview card: the mark, the wordmark, and what the product is. */
export const alt = "ProFit — gym management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_GREEN = "#2ee87f";
const MARK_FOREGROUND = "#052e16";
const BRAND_ACCENT = "#0aa352";
const BAR_HEIGHTS = [31, 53, 84];

const OpengraphImage = () =>
  new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        background: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 7,
          paddingBottom: 26,
          width: 141,
          height: 141,
          borderRadius: 40,
          background: BRAND_GREEN,
        }}
      >
        {BAR_HEIGHTS.map((height) => (
          <div
            key={height}
            style={{
              width: 22,
              height,
              borderRadius: 11,
              background: MARK_FOREGROUND,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>
        <span style={{ color: "#0a0a0a" }}>Pro</span>
        <span style={{ color: BRAND_ACCENT }}>Fit</span>
      </div>

      <div style={{ display: "flex", fontSize: 32, color: "#595959" }}>
        Members, plans, products and orders — one terminal for the whole gym.
      </div>
    </div>,
    { ...size }
  );

export default OpengraphImage;
