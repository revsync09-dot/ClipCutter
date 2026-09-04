export type ToolStatus={available:boolean;version:string|null;detail:string|null};
export type SystemStatus={ffmpeg:ToolStatus;ffprobe:ToolStatus;ollama:ToolStatus;whisper:ToolStatus;gpu_detected:boolean;python_version:string};
