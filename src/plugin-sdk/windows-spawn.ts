export type WindowsSpawnProgram = {
  command: string;
  leadingArgv: string[];
  resolution: string;
  shell: boolean;
  windowsHide: boolean;
};

export type WindowsSpawnInvocation = {
  command: string;
  argv: string[];
  resolution: string;
  shell: boolean;
  windowsHide: boolean;
};

export function resolveWindowsSpawnProgram(params: {
  command: string;
  shell?: boolean;
  platform?: string;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  packageName?: string;
}): WindowsSpawnProgram {
  return {
    command: params.command,
    leadingArgv: [],
    resolution: "direct",
    shell: params.shell ?? false,
    windowsHide: false,
  };
}

export function materializeWindowsSpawnProgram(
  program: WindowsSpawnProgram,
  argv: string[],
): WindowsSpawnInvocation {
  return {
    command: program.command,
    argv: [...program.leadingArgv, ...argv],
    resolution: program.resolution,
    shell: program.shell,
    windowsHide: program.windowsHide,
  };
}
