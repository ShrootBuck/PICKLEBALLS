import { ImageResponse } from "next/og";

export const contentType = "image/png";
export const size = {
  width: 180,
  height: 180,
};

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#23412e",
        borderRadius: 42,
      }}
    >
      <div
        style={{
          width: 132,
          height: 132,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#d7ff4d",
          borderRadius: 999,
          border: "6px solid #f6f7f2",
        }}
      >
        <div
          style={{
            fontSize: 72,
            lineHeight: 1,
            transform: "rotate(-8deg)",
            display: "flex",
          }}
        >
          🎾
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
