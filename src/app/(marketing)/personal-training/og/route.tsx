import { ImageResponse } from "next/og";
import { CLUB } from "@/lib/marketing/personal-training";

/**
 * The share card for the Personal Training routes.
 *
 * There is not one photograph on this site yet, so every link shared to
 * Facebook, Instagram or a text message previewed as a blank rectangle. This
 * is not a placeholder for the photograph — §15 is explicit that solid brand
 * navy beats stock, and a wordmark on navy is a legitimate share card in its
 * own right. It also gives the `HealthClub` node an `image` and a `logo`,
 * which a local-business record is expected to carry.
 *
 * Generated at build time, so there is no binary to keep in the repository and
 * nothing to re-export when the address or the founding year changes.
 *
 * Deliberately a route handler at a STABLE path rather than Next's
 * `opengraph-image.tsx` convention. That convention appends a content hash to
 * the URL, which is right for a meta tag Next writes itself and wrong for the
 * `image` and `logo` on the organization's JSON-LD, which have to be a URL
 * this codebase can name. One image, one URL, used by both — see OG_IMAGE.
 */
export const dynamic = "force-static";

const size = { width: 1200, height: 630 };

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#0a1a30",
          backgroundImage:
            "radial-gradient(1000px 560px at 78% -8%, #1d4788 0%, rgba(29,71,136,0) 62%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 26,
              letterSpacing: 6,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            TIMBERHILL
          </div>
          <div
            style={{
              fontSize: 17,
              letterSpacing: 7,
              color: "#7FC8FF",
              marginTop: 4,
            }}
          >
            ATHLETIC CLUB
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 92,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -2,
            }}
          >
            PERSONAL TRAINING
          </div>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 2,
              color: "#9dc4f5",
              marginTop: 22,
            }}
          >
            YOUR GOALS. YOUR PLAN. YOUR COACH.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 21,
            color: "#8aa6cc",
            borderTop: "1px solid rgba(255,255,255,0.18)",
            paddingTop: 22,
          }}
        >
          <div style={{ display: "flex" }}>
            Corvallis, Oregon · Since {CLUB.founded}
          </div>
          <div style={{ display: "flex", color: "#ffffff" }}>
            Free 30-minute consultation
          </div>
        </div>
      </div>
    ),
    size,
  );
}
