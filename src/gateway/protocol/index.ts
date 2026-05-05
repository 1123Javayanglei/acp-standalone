export type EventFrame = {
  type: string;
  event: string;
  seq?: number;
  payload?: unknown;
};

export { EventFrame as default };
