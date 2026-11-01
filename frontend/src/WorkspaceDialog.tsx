export type WorkspaceInfo = {
  name: string;
  public?:boolean;
  starter_design?:string|null;
  active_design: string;
  workspace_code: string;
  designs: { id: string; name: string; deleted: boolean; modified_at?:string; is_empty?:boolean }[];
};

