import {sketchAngle,sketchAxisAngle,interiorAngleValue,interiorAngleExpression} from "./sketchAngles";
import {sketchMoveOrigin,solveSketchMove} from "./sketchMovement";
import {solveSketchDraft} from "./solveSketchDraft";
import {anchorReference,editableEndpoint,freeRelationshipGeometry,deleteSketchSelection} from "./sketchRelationships";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { expressionLabel } from "./api";
import { NumericInput, ResolvedNumericInput, resolveNumericText } from "./NumericInput";
import { Check, Crosshair, Trash2, Undo2, X } from "lucide-react";
import {
  SKETCH_FIELDS,
  sketchClick,
  sketchAnchors,
  projectSketchReference,
  type SketchDraft,
  type SketchPoint,
} from "./sketchModel";
import type { Selection, State } from "./types";
export interface SketchPanelHandle {
  chooseAxis:(axis:"X"|"Y"|"Z")=>void;
  point: (
    point: SketchPoint,
    tolerance: number,
    selection: Selection | null,
    additive?:boolean,
    removeOnly?:boolean,
  ) => void;
  finish: () => void;
  escape: () => void;
  undo: () => void;
  dimensionKey: (key: string) => boolean;
  dimensionChange: (value: string) => void;
  deleteSelection:()=>void;
  selectTool:()=>void;
  editMeasurement:(id:string)=>void;
}
export default forwardRef<
  SketchPanelHandle,
  {
    draft: SketchDraft;
    state: State;
    onChange: (draft: SketchDraft) => void;
    onFinish: (draft: SketchDraft) => Promise<void>;
    onCancel: () => void;
    onFacePlane: () => void;
    onAlign: () => void;
    embedded: boolean;
    planePicking: boolean;
    onPlaneChosen: () => void;
    onDimensionEditor: (
      editor: { line: string; value: string; error?: string; kind?:"length"|"angle"; second?:string|null } | null,
    ) => void;
  }
>(function SketchPanel(
  {
    draft: d,
    state,
    onChange,
    onFinish,
    onCancel,
    onFacePlane,
    onAlign,
    embedded,
    planePicking,
      onDimensionEditor,
  },
  ref,
) {
  const resolveLength = (text: string) => resolveNumericText(text, Object.values(state.document.parameters),
    Object.fromEntries(Object.entries(state.parameter_graph).map(([id, info]) => [id, info.value])), "length");
  const [u, setU] = useState("0"),
    [v, setV] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useRef<SketchDraft[]>([]);
  const [relationshipBusy,setRelationshipBusy]=useState(false);
  const relationshipEpoch=useRef(0);
  useEffect(()=>()=>{relationshipEpoch.current++;},[]);
  const [dimensionKind,setDimensionKind]=useState<"length"|"angle">("length");
  const [dimensionSecond,setDimensionSecond]=useState<string|null>(null);
  const [dimensionLine, setDimensionLine] = useState<string | null>(null);
  const [dimensionValue, setDimensionValue] = useState("");
  const dimensionBase = useRef<SketchDraft | null>(null);
  const moveBase=useRef<{draft:SketchDraft;origin:SketchPoint}|null>(null);
  const moveEpoch=useRef(0),movingCommit=useRef(false);
  useEffect(()=>()=>{moveEpoch.current++;},[]);
  const latest = useRef(d);
  latest.current = d;
  const [dimensionStatus, setDimensionStatus] = useState<
    "idle" | "working" | "valid" | "error"
  >("idle");
  const [dimensionError, setDimensionError] = useState("");
  const lastValid = useRef("");
  useEffect(() => {
    onDimensionEditor(
      dimensionLine
        ? { line: dimensionLine, value: dimensionValue, error: dimensionError,kind:dimensionKind,second:dimensionSecond }
        : null,
    );
  }, [dimensionLine, dimensionValue, dimensionError, dimensionKind,dimensionSecond,onDimensionEditor]);
  useEffect(() => () => onDimensionEditor(null), [onDimensionEditor]);
  const openLine = (line: SketchDraft["entities"][number]) => {
    const c = d.constraints.find(
      (c) =>
        c.type === "distance" &&
        ((c.a === `${line.id}.start` && c.b === `${line.id}.end`) ||
          (c.b === `${line.id}.start` && c.a === `${line.id}.end`)),
    );
    const parameter =
      c?.parameter_key &&
      d.feature &&
      state.document.parameters[d.feature.parameters[c.parameter_key]];
    const expression = parameter
      ? parameter.category === "Sketch constraints"
        ? expressionLabel(parameter.expression, state.document.parameters)
        : `[${parameter.name}]`
      : undefined;
    const value =
      c?.pendingExpression ??
      expression ??
      String(
        c?.value ??
          Number(Math.hypot(line.x2 - line.x1, line.y2 - line.y1).toFixed(4)),
      );
    setDimensionKind("length");setDimensionSecond(null);
    dimensionBase.current = d;
    lastValid.current = "";
    setDimensionError("");
    setDimensionStatus("working");
    setDimensionValue(value);
    setDimensionLine(line.id);
    onChange({ ...d,tool:"dimension",relationshipFirst:null, selected: line.id, selectedAnchor: null,selectedEntities:[line.id],selectedPoints:[], message: "Pick another line for an angle, or edit this length." });
  };
  useEffect(() => {
    if (d.tool === "dimension" && d.selected && !dimensionLine) {
      const line = (d.solvedEntities || d.entities).find(
        (e) => e.id === d.selected && e.type === "line",
      );
      const lines=(d.selectedEntities||[d.selected]).map(id=>(d.solvedEntities||d.entities).find(e=>e.id===id&&e.type==="line")).filter(Boolean);
      if(lines.length===2)openAngle(lines[0]!.id,lines[1]!.id);
      else if(lines.length>2)patch({message:"Select one line for length or two for an angle."});
      else if (line) openLine(line);
    }
  }, [d.tool]);
  useEffect(() => {
    if (!dimensionLine || !dimensionBase.current) return;
    let cancelled = false;
    const value = dimensionValue.trim();
    setDimensionStatus("working");
    setDimensionError("");
    const timer = setTimeout(async () => {
      try {
        if (!value) throw new Error("Enter a dimension or parameter.");
        if(dimensionKind==="angle"&&Number.isFinite(Number(value))&&(dimensionSecond?.startsWith("world:")?(Number(value)<0||Number(value)>180):(Number(value)<=0||Number(value)>=360)))throw new Error(dimensionSecond?.startsWith("world:")?"Axis angles must be between 0 and 180 degrees.":"Angle must be greater than 0 and less than 360 degrees.");
        if (dimensionKind==="length" && Number.isFinite(Number(value)) && Number(value) <= 0)
          throw new Error("Dimension must be greater than zero.");
        const base = dimensionBase.current!;
        const a = dimensionKind==="angle"?dimensionLine:`${dimensionLine}.start`,
          b = dimensionKind==="angle"?dimensionSecond!:`${dimensionLine}.end`;
        const type=dimensionKind==="angle"?"angle":"distance";
        const old=base.constraints.find(c=>c.type===type&&((c.a===a&&c.b===b)||(c.a===b&&c.b===a)));
        const angleEntities=base.solvedEntities||base.entities,angleLine=angleEntities.find(e=>e.id===a)!;
        const angleFrame=dimensionKind==="angle"?(b.startsWith("world:")?sketchAxisAngle(base.frame,b.slice(6),angleLine).frame:sketchAngle(angleEntities,angleLine,angleEntities.find(e=>e.id===b)!).frame):undefined;
        const constraint={...(old||{type,a,b}),...(angleFrame?{angle_frame:old?.angle_frame||angleFrame}:{}),value:old?.value??0,pendingExpression:value};
        const constraints=old?base.constraints.map(c=>c===old?constraint:c):[...base.constraints,constraint];
        const entities=freeRelationshipGeometry(base,[dimensionLine,...(dimensionSecond&&!dimensionSecond.startsWith("world:")?[dimensionSecond]:[])]);
        const solved=await solveSketchDraft({...base,entities,solvedEntities:undefined,constraints},state);
        if(cancelled)return;
        lastValid.current = value;
        setDimensionStatus("valid");
        setDimensionError("");
        onChange({
          ...latest.current,
          entities:solved.entities,
          constraints: solved.constraints,
          solvedEntities: undefined,
          selected: dimensionLine,
          message: "",
        });
      } catch (e: any) {
        if (!cancelled) {
          setDimensionStatus("error");
          setDimensionError(e.message || "Could not solve this dimension.");
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dimensionLine, dimensionValue,dimensionKind,dimensionSecond,state.document.revision]);
  const patch = (change: Partial<SketchDraft>) => onChange({ ...d, ...change });
  const change = (next: SketchDraft) => {
    if(relationshipBusy||busy)return;
    const base=latest.current;setError("");
    const geometric=next.entities!==base.entities||next.constraints!==base.constraints;
    if(!geometric){onChange(next);return;}
    const epoch=++relationshipEpoch.current;
    if(!next.constraints.length){history.current.push(base);onChange({...next,solvedEntities:undefined});return;}
    setRelationshipBusy(true);setError("");
    void solveSketchDraft({...next,solvedEntities:undefined},state).then(solved=>{
      if(epoch!==relationshipEpoch.current)return;
      history.current.push(base);onChange({...solved,tool:latest.current.tool,cursor:latest.current.cursor,gridSnapEnabled:latest.current.gridSnapEnabled,snap:latest.current.snap,showComponents:latest.current.showComponents});
    }).catch(e=>{if(epoch===relationshipEpoch.current)setError(e.message||"Relationship could not be solved.");})
      .finally(()=>{if(epoch===relationshipEpoch.current)setRelationshipBusy(false);});
  };
  const openAngle=(first:string,second:string)=>{
    const base=dimensionLine&&dimensionBase.current?dimensionBase.current:d;
    const old=base.constraints.find(c=>c.type==="angle"&&((c.a===first&&c.b===second)||(c.a===second&&c.b===first)));
    if(old){first=old.a;second=old.b;}
    const entities=base.solvedEntities||base.entities,a=entities.find(e=>e.id===first)!,b=entities.find(e=>e.id===second)!;
    const parameter=old?.parameter_key&&base.feature&&state.document.parameters[base.feature.parameters[old.parameter_key]];
    const corner=sketchAngle(entities,a,b);
    let initial=old?.pendingExpression??(parameter?(parameter.named?`[${parameter.name}]`:expressionLabel(parameter.expression,state.document.parameters)):String(old?.value??Number(corner.value.toFixed(4))));
    if(old&&!old.angle_frame)initial=interiorAngleExpression(initial,Number(old.value??0),corner.frame);
    dimensionBase.current={...base,relationshipFirst:null};lastValid.current="";setDimensionKind("angle");setDimensionSecond(second);
    setDimensionError("");setDimensionStatus("working");setDimensionValue(String(initial));setDimensionLine(first);
    onChange({...base,tool:"dimension",selectedEntities:[first,second],selectedPoints:[],selected:first,selectedAnchor:null,relationshipFirst:null,message:""});
  };
  const openAxisAngle=(first:string,axis:"X"|"Y"|"Z")=>{
    if(relationshipBusy||busy||planePicking)return;
    const base=dimensionLine&&dimensionBase.current?dimensionBase.current:d;
    const line=(base.solvedEntities||base.entities).find(e=>e.id===first&&e.type==="line");if(!line)return;
    try{
      const corner=sketchAxisAngle(base.frame,axis,line),second=`world:${axis}`;
      const old=base.constraints.find(c=>c.type==="angle"&&c.a===first&&c.b===second);
      const parameter=old?.parameter_key&&base.feature&&state.document.parameters[base.feature.parameters[old.parameter_key]];
      const initial=old?.pendingExpression??(parameter?(parameter.named?`[${parameter.name}]`:expressionLabel(parameter.expression,state.document.parameters)):String(old?.value??Number(corner.value.toFixed(4))));
      dimensionBase.current={...base,relationshipFirst:null};lastValid.current="";setDimensionKind("angle");setDimensionSecond(second);setDimensionValue(String(initial));setDimensionError("");setDimensionStatus("working");setDimensionLine(first);setError("");
      onChange({...base,tool:"dimension",selected:first,selectedEntities:[first],selectedPoints:[],selectedAnchor:null,relationshipFirst:null,message:`Angle to world ${axis}. Enter accepts; Escape cancels.`});
    }catch(e:any){setError(e.message);}
  };
  const chooseAxis=(axis:"X"|"Y"|"Z")=>{
    const first=dimensionLine||d.selected;
    if(!first){patch({message:"Select a line segment, then choose a world axis to dimension its angle."});return;}
    openAxisAngle(first,axis);
  };
  const selectGeometry=(base:SketchDraft,hit:SketchDraft,additive=false,removeOnly=false):SketchDraft=>{
    const point=hit.selectedAnchor,entity=hit.selected;
    let entities=additive||removeOnly?[...(base.selectedEntities||[])]:[],points=additive||removeOnly?[...(base.selectedPoints||[])]:[];
    if(point){if(points.includes(point.id))points=points.filter(id=>id!==point.id);else if(!removeOnly)points.push(point.id);}
    else if(entity){if(entities.includes(entity))entities=entities.filter(id=>id!==entity);else if(!removeOnly)entities.push(entity);}
    const active=point?points.includes(point.id):!!entity&&entities.includes(entity);
    const primaryPoint=active?point:sketchAnchors(base).find(a=>a.id===points.at(-1))||null;
    const primary=active?entity:primaryPoint?.entity||entities.at(-1)||null;
    return {...base,selected:primary,selectedAnchor:primaryPoint,selectedEntities:entities,selectedPoints:points};
  };
  const cancelMove=(tool=d.tool)=>{
    moveEpoch.current++;movingCommit.current=false;setRelationshipBusy(false);setError("");
    const base=moveBase.current?.draft;moveBase.current=null;
    if(base)onChange({...base,tool,moveOrigin:null,solvedEntities:undefined,cursor:null,pending:[]});
  };
  const selectTool=()=>{
    relationshipEpoch.current++;moveEpoch.current++;movingCommit.current=false;setRelationshipBusy(false);setError("");
    const base=moveBase.current?.draft||dimensionBase.current||latest.current;
    moveBase.current=null;dimensionBase.current=null;setDimensionLine(null);setDimensionError("");
    onChange({...base,tool:"select",moveOrigin:null,solvedEntities:undefined,pending:[],cursor:null,relationshipFirst:null,message:""});
  };
  const applyMoveAt=async(point:SketchPoint)=>{
    const session=moveBase.current;if(!session||movingCommit.current)return;
    const epoch=++moveEpoch.current;movingCommit.current=true;setRelationshipBusy(true);setError("");
    try{
      const result=await solveSketchMove(session.draft,[point[0]-session.origin[0],point[1]-session.origin[1]],state);
      if(epoch!==moveEpoch.current)return;
      history.current.push(session.draft);moveBase.current=null;
      onChange({...result,tool:"select",cursor:null,message:"",snap:latest.current.snap,gridSnapEnabled:latest.current.gridSnapEnabled,showComponents:latest.current.showComponents});
    }catch(e:any){if(epoch===moveEpoch.current)setError(e.message||"Could not move the selection.");}
    finally{if(epoch===moveEpoch.current){movingCommit.current=false;setRelationshipBusy(false);}}
  };
  useEffect(()=>{
    if(d.tool!=="move"){if(moveBase.current)cancelMove(d.tool);return;}
    if(moveBase.current)return;
    try{
      const base={...d,entities:d.solvedEntities||d.entities,solvedEntities:undefined},origin=sketchMoveOrigin(base);
      if(origin){moveBase.current={draft:base,origin};onChange({...base,moveOrigin:origin,cursor:origin,message:"Pick the destination point. Enter applies; Space cancels."});}
    }catch(e:any){setError(e.message);}
  },[d.tool]);
  useEffect(()=>{
    const session=moveBase.current;if(d.tool!=="move"||!session||!d.cursor||movingCommit.current)return;
    const epoch=++moveEpoch.current,delta:SketchPoint=[d.cursor[0]-session.origin[0],d.cursor[1]-session.origin[1]];
    const timer=setTimeout(()=>{
      void solveSketchMove(session.draft,delta,state).then(solved=>{
        if(epoch===moveEpoch.current){setError("");onChange({...latest.current,solvedEntities:solved.entities});}
      }).catch(e=>{if(epoch===moveEpoch.current)setError(e.message||"Move conflicts with sketch relationships.");});
    },90);
    return ()=>{clearTimeout(timer);};
  },[d.cursor,d.tool,state.document.revision]);
  const deleteSelection=()=>{if(relationshipBusy||busy||dimensionLine||planePicking)return;change(deleteSketchSelection(d));};
  const point = (
    p: SketchPoint,
    tolerance: number,
    selection: Selection | null,
    additive=false,
    removeOnly=false,
  ) => {
    if(relationshipBusy||busy||planePicking)return;
    if(removeOnly){
      if(d.tool!=="select")return;
      const hit=sketchClick({...d,entities:d.solvedEntities||d.entities,tool:"select"},p,tolerance);
      onChange(selectGeometry(d,hit,true,true));return;
    }

    if(d.tool==="move"){
      if(moveBase.current){void applyMoveAt(p);return;}
      const shown={...d,entities:d.solvedEntities||d.entities,tool:"select" as const},hit=sketchClick(shown,p,tolerance);
      if(!hit.selected){patch({message:"Select a point or line to move."});return;}
      const base=selectGeometry({...d,entities:shown.entities,solvedEntities:undefined},hit,additive);
      try{const origin=sketchMoveOrigin(base);if(origin){moveBase.current={draft:base,origin};onChange({...base,moveOrigin:origin,cursor:origin,message:"Pick the destination point. Enter applies; Space cancels."});}}catch(e:any){setError(e.message);}
      return;
    }
    if(["connect","disconnect"].includes(d.tool)){
      if(dimensionLine)return;
      const shown={...d,entities:d.solvedEntities||d.entities,tool:"select" as const};
      const hit=sketchClick(shown,p,tolerance);
      const anchor=hit.selectedAnchor;
      if(!editableEndpoint(anchor)){patch({message:"Pick an endpoint, center, or point. Midpoints are reference markers."});return;}
      const reference=anchorReference(anchor!);
      if(d.tool==="disconnect"){
        const constraints=d.constraints.filter(c=>c.type!=="coincident"||![c.a,c.b].includes(reference));
        if(constraints.length===d.constraints.length){patch({message:"This point has no connection relationship."});return;}
        change({...d,entities:shown.entities,constraints,selected:anchor!.entity,selectedAnchor:anchor,selectedEntities:[],selectedPoints:[anchor!.id],relationshipFirst:null,message:""});return;
      }
      const first=d.relationshipFirst?.anchor;
      if(!first){patch({selected:anchor!.entity,selectedAnchor:anchor,selectedEntities:[],selectedPoints:[anchor!.id],relationshipFirst:{entity:anchor!.entity,anchor},message:"Pick the endpoint or point to connect to."});return;}
      const a=anchorReference(first),b=reference;
      if(a===b){patch({message:"Pick a different endpoint or point."});return;}
      if(d.constraints.some(c=>c.type==="coincident"&&((c.a===a&&c.b===b)||(c.a===b&&c.b===a)))){patch({relationshipFirst:null,message:"These points are already connected."});return;}
      change({...d,entities:freeRelationshipGeometry(d,[first.entity,anchor!.entity]),constraints:[...d.constraints,{type:"coincident",a,b}],selected:anchor!.entity,selectedAnchor:anchor,selectedEntities:[],selectedPoints:[anchor!.id],relationshipFirst:null,message:""});return;
    }
    if (d.tool === "dimension") {
      const shown = {
        ...d,
        entities: d.solvedEntities || d.entities,
        tool: "select" as const,
      };
      const hit = sketchClick(shown, p, tolerance);
      const line = shown.entities.find(
        (e) => e.id === hit.selected && e.type === "line",
      );
      if(line&&dimensionLine&&line.id!==dimensionLine)openAngle(dimensionLine,line.id);
      else if(line&&!dimensionLine)openLine(line);
      else patch({ message: "Select a line segment to dimension." });
      return;
    }
    const shown = d.solvedEntities ? { ...d, entities: d.solvedEntities } : d;
    if (d.tool === "select") {
      const picked = sketchClick(shown, p, tolerance);
      onChange(selectGeometry(d,picked,additive));
      return;
    }
    const editable = d.solvedEntities
      ? { ...d, entities: d.solvedEntities, solvedEntities: undefined }
      : d;
    change(
      d.tool === "project"
        ? projectSketchReference(editable, selection, state)
        : sketchClick(editable, p, tolerance),
    );
  };
  const applyDimension = () => {
    if (!dimensionLine) return;
    if (
      dimensionStatus !== "valid" ||
      lastValid.current !== dimensionValue.trim()
    ) {
      setDimensionError(
        dimensionStatus === "working"
          ? "Solving…"
          : dimensionError || "Enter a valid dimension.",
      );
      return;
    }
    if (dimensionBase.current) history.current.push(dimensionBase.current);
    dimensionBase.current = null;
    setDimensionLine(null);
    setDimensionError("");
  };
  const cancelDimension = () => {
    const base = dimensionBase.current;
    dimensionBase.current = null;
    setDimensionLine(null);
    setDimensionError("");
    if (base) onChange({...base,tool:latest.current.tool,relationshipFirst:null});
  };
  const dimensionKey = (key: string) => {
    if (!dimensionLine) return false;
    if (key === "Enter") applyDimension();
    else if (key === "Escape") cancelDimension();
    else return false;
    return true;
  };
  useEffect(() => {
    if(dimensionLine&&d.tool!=="dimension")cancelDimension();
  }, [d.tool]);
  const finish = async () => {
    if (busy || relationshipBusy || planePicking) return;
    if (document.querySelector('.sketch-panel input[aria-invalid="true"]')) {
      setError("Resolve the highlighted numeric field before finishing the sketch.");
      return;
    }
    if(moveBase.current){void applyMoveAt(d.cursor||moveBase.current.origin);return;}
    if (dimensionLine) {
      applyDimension();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onFinish({ ...d, pending: [], cursor: null });
    } catch (e: any) {
      setError(e.message || "Sketch could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const escape = () => {
    if(moveBase.current){cancelMove("select");return;}
    if(relationshipBusy)return;
    if(d.relationshipFirst){patch({relationshipFirst:null,message:""});return;}
    if(d.selected&&d.tool==="select"){patch({selected:null,selectedAnchor:null,selectedEntities:[],selectedPoints:[]});return;}
    if (d.pending.length) patch({ pending: [], cursor: null, message: "" });
    else onCancel();
  };
  const undo = () => {
    if(moveBase.current){cancelMove("select");return;}
    if (busy || relationshipBusy || planePicking || dimensionLine) return;
    setError("");
    const previous = history.current.pop();
    if (previous)
      onChange({
        ...previous,
        tool: d.tool,
        gridSnapEnabled: d.gridSnapEnabled,
        snap: d.snap,
        pending: [],
        cursor: null,
        selectedAnchor: null,
      });
  };
  useImperativeHandle(ref, () => ({
    point,
    chooseAxis,
    finish,
    escape,
    undo,
    dimensionKey,
    dimensionChange: setDimensionValue,
    deleteSelection,
    selectTool,
    editMeasurement(id){if(relationshipBusy||busy)return;const [kind,a,b]=id.split(":");if(kind==="length"){const line=(d.solvedEntities||d.entities).find(e=>e.id===a&&e.type==="line");if(line)openLine(line);}else if(kind==="angle"&&a&&b){if(b==="world"&&["X","Y","Z"].includes(id.split(":")[3]))openAxisAngle(a,id.split(":")[3] as "X"|"Y"|"Z");else openAngle(a,b);}},
  }));
  const selected = d.entities.find((e) => e.id === d.selected);
  const selectedAnchor = sketchAnchors(d).find(
    (a) => a.id === d.selectedAnchor?.id,
  );
  const hint =
    d.tool === "move"?"Select a point or line, then pick its destination. A midpoint moves the whole line. Space cancels the move.":
    d.tool === "connect"?"Pick two endpoints or points to join them. K starts Connect.":
    d.tool === "disconnect"?"Pick a connected endpoint to remove its connection. U starts Disconnect.":
    d.tool === "dimension"
      ? "One line sets length; another line or a world axis sets angle. Pick an axis in the viewport or the XYZ corner control."
      : d.tool === "select"
        ? "Click geometry to edit exact values."
        : d.tool === "project"
          ? "Pick a component edge, vertex or face. Projection creates independent construction geometry."
          : d.tool === "arc"
            ? "Pick center, start, then end. Arcs run counterclockwise."
            : d.tool === "line"
              ? "Pick points for connected lines. End chain stops the current line."
              : d.tool === "rectangle"
                ? "Pick opposite corners."
                : d.tool === "circle"
                  ? "Pick center, then a point on the radius."
                  : "Pick a point.";
  return (
    <aside
      className="operation-panel sketch-panel"
      aria-label="Sketch workspace"
    >
      <header className="operation-header">
        <h2>
          {d.feature ? "Edit sketch" : "Sketch"} <kbd>E</kbd>
        </h2>
        <button
          className="icon-button"
          onClick={onCancel}
          aria-label="Cancel sketch"
        >
          <X size={16} />
        </button>
      </header>
      <div className="operation-fields sketch-panel-scroll">
        <section>
          <h3>Sketch plane</h3>
          <div
            className="operation-reference-control sketch-plane-reference"
            data-reference-role="profile"
          >
            <button
              className={`operation-pick-slot ${planePicking ? "picking" : ""}`}
              onClick={onFacePlane}
              disabled={!!d.feature || d.entities.length > 0}
            >
              <Crosshair size={13} />
              <span>
                <strong>Sketch plane reference</strong>
                <small>
                  {planePicking
                    ? "Pick a world plane or planar face in the viewport"
                    : d.plane==="custom"?"Picked planar reference":`World ${d.plane} plane`}
                </small>
              </span>
            </button>
            <button onClick={onAlign} disabled={planePicking}>
              Align view
            </button>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.showComponents}
              onChange={(e) => patch({ showComponents: e.target.checked })}
            />
            Show reference components
          </label>
        </section>
        <section inert={planePicking || relationshipBusy || !!dimensionLine}>
          <h3>Drawing settings</h3>
          <p className="sketch-help">{hint}</p>
          {d.pending.length > 0 && (
            <button onClick={() => patch({ pending: [], cursor: null })}>
              End chain / reset points
            </button>
          )}
          <div className="field-grid">
            <label className="field">
              <span>U (mm)</span>
              <NumericInput kind="length"
                aria-label="Sketch U"
                step="any"
                value={u}
                onChange={(e) => setU(e.target.value)}
              />
            </label>
            <label className="field">
              <span>V (mm)</span>
              <NumericInput kind="length"
                aria-label="Sketch V"
                step="any"
                value={v}
                onChange={(e) => setV(e.target.value)}
              />
            </label>
          </div>
          <button
            disabled={
              d.tool === "project" ||
              d.tool === "select" ||
              ["dimension","angle","connect","disconnect"].includes(d.tool) ||
              !Number.isFinite(resolveLength(u)) ||
              !Number.isFinite(resolveLength(v))
            }
            onClick={()=>d.tool==="move"?point([resolveLength(u),resolveLength(v)],0,null):change({...sketchClick({...d,snap:0},[resolveLength(u),resolveLength(v)],0),snap:d.snap})}
          >
            {d.tool==="move"?"Move to coordinates":"Place exact point"}
          </button>
          <label className="field">
            <span>Grid snap (mm; 0 = off)</span>
            <input
              aria-label="Sketch grid snap"
              type="number"
              min="0"
              step=".1"
              value={d.snap}
              onChange={(e) =>
                patch({ snap: Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.construction}
              onChange={(e) => patch({ construction: e.target.checked })}
            />
            Construction geometry
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.fixed}
              onChange={(e) => patch({ fixed: e.target.checked })}
            />
            Fix new geometry to exact coordinates
          </label>
          <button disabled={!history.current.length || busy} onClick={undo}>
            <Undo2 size={13} />
            Undo sketch edit
          </button>
        </section>
        <section inert={planePicking || relationshipBusy || !!dimensionLine || d.tool==="move"}>
          <h3>
            Geometry <small>{d.entities.length} / 200</small>
          </h3>
          <select
            aria-label="Sketch entity"
            value={d.selected || ""}
            onChange={(e) =>
              patch({
                selected: e.target.value || null,
                selectedAnchor: null,selectedPoints:[],selectedEntities:e.target.value?[e.target.value]:[],
                tool: "select",
                pending: [],
              })
            }
          >
            <option value="">Select geometry</option>
            {d.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.type}
                {e.construction ? " · construction" : ""}
              </option>
            ))}
          </select>
          {selectedAnchor && (
            <div className="sketch-point-info" role="status">
              <strong>
                {selectedAnchor.entity} ·{" "}
                {selectedAnchor.kind === "mid"
                  ? "Midpoint"
                  : selectedAnchor.kind}
              </strong>
              <span>
                U {selectedAnchor.point[0].toFixed(3)} · V{" "}
                {selectedAnchor.point[1].toFixed(3)} mm
              </span>
            </div>
          )}
          {selected && (
            <>
              <div className="field-grid">
                {SKETCH_FIELDS[selected.type].map((field) => (
                  <label className="field" key={field}>
                    <span>{field.replaceAll("_", " ")}</span>
                    <ResolvedNumericInput kind={field.includes("angle") ? "angle" : "length"}
                      step="any"
                      aria-label={`Entity ${field}`}
                      value={selected.expressions?.[field] ?? selected[field]}
                      onValue={(number, expression) =>
                        change({
                          ...d,
                          entities: d.entities.map((item) =>
                            item.id === selected.id
                              ? { ...item, [field]: number, expressions: { ...item.expressions, [field]: expression } }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.construction}
                  onChange={(e) =>
                    change({
                      ...d,
                      entities: d.entities.map((item) =>
                        item.id === selected.id
                          ? { ...item, construction: e.target.checked }
                          : item,
                      ),
                    })
                  }
                />
                Construction
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.fixed}
                  onChange={(e) =>
                    change({
                      ...d,
                      entities: d.entities.map((item) =>
                        item.id === selected.id
                          ? { ...item, fixed: e.target.checked }
                          : item,
                      ),
                    })
                  }
                />
                Fixed coordinates
              </label>
              <button onClick={deleteSelection} disabled={relationshipBusy}><Trash2 size={13}/>Delete geometry</button>
            </>
          )}
          {d.constraints.length > 0 && (
            <>
              <h4>Existing constraints</h4>
              {d.constraints.map((c, i) => (
                <div className="sketch-constraint-row" key={c.id || i}>
                  <span>
                    {c.type} · {c.a}
                    {c.b ? ` / ${c.b}` : ""}
                  </span>
                  {c.value!==undefined&&<span>{c.type==="angle"&&!c.angle_frame&&!c.b?.startsWith("world:")?Number(interiorAngleValue(c.value,sketchAngle(d.solvedEntities||d.entities,(d.solvedEntities||d.entities).find(e=>e.id===c.a)!,(d.solvedEntities||d.entities).find(e=>e.id===c.b)!).frame).toFixed(2)):c.pendingExpression??c.value}{c.type==="angle"?"°":" mm"}</span>}
                  <button
                    aria-label={`Remove constraint ${i + 1}`}
                    onClick={() =>
                      change({
                        ...d,
                        constraints: d.constraints.filter((_, j) => i !== j),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
        {relationshipBusy&&<p className="sketch-help" role="status">Solving relationship…</p>}
        {(d.message || error) && (
          <p role={error ? "alert" : "status"} className="sketch-help">
            {error || d.message}
          </p>
        )}
      </div>
      <footer className="operation-commit-row sketch-commit">
        <label className="field">
          <span>Sketch name</span>
          <input
            aria-label="Sketch name"
            value={d.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <div>
          <button
            className="primary"
            disabled={
              busy || relationshipBusy ||
              planePicking ||
              !d.entities.length ||
              d.entities.length > 200
            }
            onClick={finish}
          >
            <Check size={14} />
            {busy
              ? "Saving…"
              : embedded
                ? "Finish & use profile"
                : "Finish sketch"}
          </button>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </footer>
    </aside>
  );
});
