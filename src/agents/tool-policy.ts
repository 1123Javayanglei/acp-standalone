export type OwnerOnlyToolApprovalClass =
  | "readonly_scoped"
  | "readonly_search"
  | "mutating"
  | "exec_capable"
  | "control_plane"
  | "interactive"
  | "other"
  | "unknown";

export function resolveOwnerOnlyToolApprovalClass(
  _toolId: string,
  _args?: unknown,
): OwnerOnlyToolApprovalClass | undefined {
  return undefined;
}
