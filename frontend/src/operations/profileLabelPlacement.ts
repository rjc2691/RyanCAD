export interface ProfileLabelCandidate {
  x: number;
  y: number;
  distance: number;
  local: number[];
}
/** Keep a geometric anchor through near ties; switch only for a meaningful gain. */
export class ProfileLabelPlacement {
  private key = "";
  private anchor: number[] | null = null;
  private visible = false;
  update(
    points: ProfileLabelCandidate[],
    key: string,
  ): ProfileLabelCandidate | null {
    if (key !== this.key) {
      this.key = key;
      this.anchor = null;
      this.visible = false;
    }
    const candidates = points.filter((p) =>
      [p.x, p.y, p.distance, ...p.local].every(Number.isFinite),
    );
    if (!candidates.length) {
      this.anchor = null;
      this.visible = false;
      return null;
    }
    const best = candidates.reduce((a, b) =>
      b.distance > a.distance + 0.001
        ? b
        : Math.abs(a.distance - b.distance) <= 0.001 &&
            (b.x > a.x + 0.001 || (Math.abs(b.x - a.x) <= 0.001 && b.y < a.y))
          ? b
          : a,
    );
    let chosen = best;
    if (this.anchor) {
      const anchor = this.anchor;
      const retained = candidates.reduce((a, b) =>
        Math.hypot(...b.local.map((v, i) => v - anchor[i])) <
        Math.hypot(...a.local.map((v, i) => v - anchor[i]))
          ? b
          : a,
      );
      if (best.distance - retained.distance <= 12) chosen = retained;
    }
    this.anchor = [...chosen.local];
    this.visible = chosen.distance > (this.visible ? 70 : 80);
    return this.visible ? chosen : null;
  }
}
