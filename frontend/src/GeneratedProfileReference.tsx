import { Crosshair, LoaderCircle } from "lucide-react";
import { numeric } from "./api";
import { generatedProfileDrawing } from "./generatedProfile";

export default function GeneratedProfileReference({profile, shape, embedded = false, updating = false}: {profile?: any; shape: string; embedded?: boolean; updating?: boolean}) {
  const drawing = generatedProfileDrawing(profile);
  return <div className={embedded ? "generated-tool-profile" : "operation-reference-control generated-tool-profile"} data-reference-role="profile" data-profile-id={profile?.id} data-profile-area={profile?.area} role="group" aria-label="Generated Tool Profile reference" aria-busy={updating}>
    <div className="operation-pick-slot operation-readonly-reference"><Crosshair size={15} aria-hidden="true" /><span><strong>Tool Profile reference</strong><small>{profile?.name || (shape === "fillet" ? "Round corner profile" : "Bevel corner profile")}</small></span><small className="generated-profile-tag">Temporary</small></div>
    {drawing ? <div className="generated-profile-details"><svg viewBox="0 0 112 80" aria-label="Tool Profile cross section" role="img"><path d={drawing} fillRule="evenodd" /></svg><div><strong>Area {numeric(profile.area, 3)} mm²</strong><small>Perpendicular to Tool Path</small>{updating && <small><LoaderCircle size={11} className="spin" /> Updating profile…</small>}</div></div> : <p className="operation-reference-status">{updating ? "Generating profile…" : "Select a path and size to generate this profile."}</p>}
  </div>;
}
