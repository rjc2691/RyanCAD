export interface Parameter {
  named?: boolean | null;
  id: string;
  name: string;
  owner: string;
  kind: "length" | "angle" | "count" | "ratio";
  expression: string;
  category: string;
  description: string;
  favorite: boolean;
  tolerance: { minus: number; plus: number } | null;
  created_by: string;
  modified_by: string;
}
export interface Feature {
  id: string;
  name: string;
  owner: string;
  type: string;
  parameters: Record<string, string>;
  references: Record<string, any>;
  options: Record<string, any>;
  suppressed: boolean;
  created_by: string;
  modified_by: string;
}
export interface Component {
  description: string;
  structure_role?: "component" | "part" | "group" | "layout";
  read_only?: boolean;
  id: string;
  name: string;
  kind: "assembly" | "solid" | "planar";
  purpose?: "part" | "tool";
  feature_ids: string[];
  color: string;
  created_by: string;
  modified_by: string;
  source_definition: string | null;
  stock_thickness: string | null;
  stock_preview: boolean;
}
export interface Occurrence {
  structure_role?: "component" | "part" | "group" | "layout";
  layout?: string | null;
  library?: boolean;
  variation?: string | null;
  source_definition?: string;
  purpose?: "part" | "tool";
  id: string;
  source_id: string;
  name: string;
  definition: string;
  parent: string;
  kind: string;
  visible: boolean;
  suppressed: boolean;
  color: string;
  matrix: number[][];
  placement: Record<string, string>;
  pattern_index?: number;
  pattern_mode?: "linear" | "circular" | null;
}
export interface FaceInfo {
  edge_signatures?: string[];
  name?: string;
  outlines?: number[][][];
  signature?: string;
  id: string;
  triangle_start: number;
  triangle_count: number;
  area: number;
  center: number[];
  normal: number[];
  type: string;
  controlling_parameter?: string;
  bounds: { min: number[]; max: number[]; size: number[] };
}
export interface Geometry {
  named_extents?: Record<string, string[]>;
  center?: number[];
  vertices?: number[][];
  vertex_info?: { id: string; name: string; point: number[] }[];
  stock_thickness_mm?: number | null;
  thickness_preview?: boolean;
  status: string;
  volume: number | null;
  area: number | null;
  bounds?: { min: number[]; max: number[]; size: number[] };
  triangles?: number;
  faces?: FaceInfo[];
  edges?: any[];
  face_count?: number;
  edge_count?: number;
  geometry_key?: string;
}
export interface Selection {
  worldPlane?: 'XY'|'XZ'|'YZ';
  worldOrigin?: boolean;
  geometryKey?: string;
  /** Homogeneous Shift-click selection, primary item first. */
  items?: Selection[];
  vertex?: { point: number[]; edge: any; anchor: "start" | "mid" | "end" };
  occurrence: string;
  definition: string;
  face?: FaceInfo;
  edge?: any;
  /** Local surface hit, used to anchor viewport measurements on actual geometry. */
  point?: number[];
}
export interface State {
  part_parameters?: Record<string, string[]>;
  operation_displays?: Record<string, any>;
  profiles?: Record<
    string,
    {
      status: string;
      region_count?: number;
      center?: number[];
      normal?: number[];
      outlines?: number[][][];
    }
  >;
  document: {
    structure_version?: number;
    active_layout?: string | null;
    variations?: Record<string, {id: string; part: string; name: string; overrides: Record<string, string>}>;
    id: string;
    name: string;
    revision: number;
    display_units: "mm" | "in";
    notes: string;
    parameters: Record<string, Parameter>;
    features: Record<string, Feature>;
    feature_order: string[];
    components: Record<string, Component>;
    instances: Record<string, any>;
    actors: Record<string, any>;
  };
  geometry: Record<string, Geometry>;
  parameter_graph: Record<string, any>;
  fits: any[];
  occurrences: Occurrence[];
  summary: {
    instances: number;
    definitions: number;
    volume_mm3: number;
    area_mm2: number;
  };
  actions: any[];
  agents: any[];
  jobs: any[];
  timings: Record<string, any>;
  sketches: Record<string, any>;
  checkpoints: { name: string; revision: number }[];
  can_undo: boolean;
  can_redo: boolean;
  save_status: string;
  save_error: string | null;
  worker_status: string;
  sequence: number;
}
export type RunCommand = (
  name: string,
  args?: Record<string, any>,
) => Promise<any>;
